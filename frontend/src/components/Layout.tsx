import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, History, LogIn, Grid3X3, Github, HelpCircle, X, UserCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../api/client';

interface LayoutProps {
    children: React.ReactNode;
}

interface BotStatus {
    running: boolean;
    logged_in: boolean;
    current_price: number | null;
    lastMessage: any | null;
}

export const BotStatusContext = React.createContext<BotStatus>({
    running: false,
    logged_in: false,
    current_price: null,
    lastMessage: null,
});

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

interface ToastContextValue {
    showToast: (options: { type: ToastType; message: string }) => void;
}

export const ToastContext = React.createContext<ToastContextValue>({
    showToast: () => { },
});

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const [botStatus, setBotStatus] = useState<BotStatus>({
        running: false,
        logged_in: false,
        current_price: null,
        lastMessage: null,
    });
    const [priceHistory, setPriceHistory] = useState<{ price: number; ts: number }[]>([]);
    const [priceTrend, setPriceTrend] = useState<'up' | 'down' | 'flat' | null>(null);

    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextToastId = React.useRef(1);

    const showToast = useCallback((options: { type: ToastType; message: string }) => {
        const id = nextToastId.current;
        nextToastId.current += 1;
        setToasts((prev) => [
            ...prev,
            { id, type: options.type, message: options.message },
        ]);
    }, []);

    const removeToast = (id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const normalizePrice = (value: any): number | null => {
        if (value === null || value === undefined) return null;
        const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
        return Number.isFinite(num) ? num : null;
    };

    const updatePrice = useCallback((value: any) => {
        const price = normalizePrice(value);
        if (price === null) return;

        setBotStatus((prev) => ({
            ...prev,
            current_price: price,
        }));

        setPriceHistory((prev) => {
            const now = Date.now();
            const next = [...prev, { price, ts: now }].filter((p) => now - p.ts <= 5000);
            const oldest = next[0];
            if (oldest) {
                const trend = price > oldest.price ? 'up' : price < oldest.price ? 'down' : 'flat';
                setPriceTrend(trend);
            }
            return next;
        });
    }, []);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get('/bot/status');
            const data = res.data as BotStatus;
            const price = normalizePrice((data as any).current_price);
            setBotStatus((prev) => ({
                ...prev, // Keep lastMessage
                running: data.running,
                logged_in: data.logged_in,
                current_price: price ?? prev.current_price,
            }));
            if (price !== null) {
                updatePrice(price);
            }
        } catch (error) {
            console.error('Failed to fetch bot status', error);
        }
    }, [updatePrice]);

    const handleLoginClick = async () => {
        try {
            showToast({ type: 'warning', message: '正在開啟登入頁面...' });
            const res = await api.post('/bot/open-login');

            if (res.data.status === 'SUCCESS' || (res.data.message && res.data.message.includes('open'))) {
                showToast({ type: 'success', message: '已開啟登入視窗，請在瀏覽器中完成登入。' });
            } else {
                showToast({ type: 'warning', message: res.data.message || '請手動檢查瀏覽器。' });
            }
        } catch (e) {
            console.error(e);
            showToast({ type: 'error', message: '無法開啟登入頁面，請確認 BOT 是否正在運行。' });
        }
    };

    // Polling Effect
    useEffect(() => {
        fetchStatus();
        // Dynamic interval: 3s if not logged in (to catch login success), 15s if logged in
        const intervalMs = botStatus.logged_in ? 15000 : 3000;
        const timer = setInterval(fetchStatus, intervalMs);
        return () => clearInterval(timer);
    }, [fetchStatus, botStatus.logged_in]);

    // WebSocket Effect
    useEffect(() => {
        // WebSocket Connection
        let ws: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout>;
        let isMounted = true;

        const connectWebSocket = () => {
            if (!isMounted) return;

            try {
                ws = new WebSocket('ws://localhost:8000/ws');

                ws.onopen = () => {
                    console.log('[WS] Connected to Bot WebSocket');
                };

                ws.onmessage = (event) => {
                    if (!isMounted) return;
                    try {
                        const message = JSON.parse(event.data);

                        // Update last message globally
                        setBotStatus((prev) => ({
                            ...prev,
                            lastMessage: message
                        }));

                        if (message.type === 'price_update' && message.data && message.data.price) {
                            updatePrice(message.data.price);
                        }
                    } catch (e) {
                        console.error('Error parsing WebSocket message:', e);
                    }
                };

                ws.onclose = () => {
                    if (isMounted) {
                        console.log('[WS] disconnected, reconnecting in 3s...');
                        reconnectTimer = setTimeout(connectWebSocket, 3000);
                    }
                };

                ws.onerror = () => {
                    ws?.close();
                };
            } catch (err) {
                console.error('Failed to create WebSocket:', err);
                if (isMounted) {
                    reconnectTimer = setTimeout(connectWebSocket, 3000);
                }
            }
        };

        connectWebSocket();

        return () => {
            isMounted = false;
            clearTimeout(reconnectTimer);
            if (ws) {
                ws.onclose = null;
                ws.close();
            }
        };
    }, []); // Run once on mount (and keep connection alive)

    return (
        <ToastContext.Provider value={{ showToast }}>
            <BotStatusContext.Provider value={botStatus}>
                <div className="min-h-screen text-text-primary font-sans selection:bg-primary/30 relative overflow-hidden">
                    {/* Background Effects */}
                    <div className="fixed inset-0 pointer-events-none">
                        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
                    </div>

                    {/* Header - Floating Glass */}
                    <header className="fixed top-4 left-4 right-4 z-50 glass-panel border border-white/10 shadow-lg">
                        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
                            <div className="flex items-center gap-8">
                                {/* Logo */}
                                <div className="flex items-center gap-2 group cursor-pointer">
                                    <div className="relative w-8 h-8 flex items-center justify-center bg-primary/20 rounded-lg backdrop-blur-sm group-hover:bg-primary/30 transition-all">
                                        <Activity className="w-5 h-5 text-primary" />
                                    </div>
                                    <span className="font-bold text-xl tracking-tight font-mono text-white">
                                        PROPW<span className="text-primary">.BOT</span>
                                    </span>
                                </div>

                                <nav className="hidden md:flex items-center gap-2">
                                    <NavLink
                                        to="/"
                                        className={({ isActive }) =>
                                            clsx(
                                                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300',
                                                isActive
                                                    ? 'bg-primary/20 text-white shadow-[0_0_15px_rgba(56,189,248,0.3)]'
                                                    : 'text-text-secondary hover:text-white hover:bg-white/10'
                                            )
                                        }
                                    >
                                        <Grid3X3 className="w-4 h-4" />
                                        <span className="font-mono tracking-wide">STRATEGIES</span>
                                    </NavLink>
                                    <NavLink
                                        to="/orders"
                                        className={({ isActive }) =>
                                            clsx(
                                                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300',
                                                isActive
                                                    ? 'bg-primary/20 text-white shadow-[0_0_15px_rgba(56,189,248,0.3)]'
                                                    : 'text-text-secondary hover:text-white hover:bg-white/10'
                                            )
                                        }
                                    >
                                        <History className="w-4 h-4" />
                                        <span className="font-mono tracking-wide">ORDERS</span>
                                    </NavLink>
                                    <NavLink
                                        to="/docs"
                                        className={({ isActive }) =>
                                            clsx(
                                                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300',
                                                isActive
                                                    ? 'bg-primary/20 text-white shadow-[0_0_15px_rgba(56,189,248,0.3)]'
                                                    : 'text-text-secondary hover:text-white hover:bg-white/10'
                                            )
                                        }
                                    >
                                        <HelpCircle className="w-4 h-4" />
                                        <span className="font-mono tracking-wide">DOCS</span>
                                    </NavLink>
                                </nav>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-black/20 border border-white/10 backdrop-blur-sm">
                                    <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]", botStatus.running ? "bg-green-400 text-green-400" : "bg-red-500 text-red-500")} />
                                    <span className="text-xs font-mono text-text-secondary">{botStatus.running ? 'ONLINE' : 'OFFLINE'}</span>
                                </div>

                                {botStatus.logged_in ? (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                        <UserCheck className="w-4 h-4 text-emerald-400" />
                                        <span className="text-xs font-mono text-emerald-400">LOGGED IN</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleLoginClick}
                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-black font-bold text-xs font-mono hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(56,189,248,0.4)]"
                                    >
                                        <LogIn className="w-3 h-3" />
                                        LOGIN
                                    </button>
                                )}
                            </div>
                        </div>
                    </header>

                    {/* Main Content */}
                    <main className="pt-32 pb-24 px-4 max-w-7xl mx-auto relative z-10">
                        {children}
                    </main>

                    {/* Bottom Status Bar - Floating Glass */}
                    <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass-panel px-8 py-3 w-auto min-w-[300px] shadow-2xl flex items-center justify-between gap-8 rounded-full border border-white/10">
                        {/* Price Info */}
                        <div className="flex items-center gap-3">
                            <span className="text-text-dim text-xs font-bold tracking-wider">BTC/USDT</span>
                            <span
                                className={clsx(
                                    "text-xl font-bold font-mono text-glow",
                                    priceTrend === 'up' && "text-emerald-400",
                                    priceTrend === 'down' && "text-red-400",
                                    (!priceTrend || priceTrend === 'flat') && "text-white"
                                )}
                            >
                                ${botStatus.current_price !== null ? botStatus.current_price.toLocaleString() : '--'}
                            </span>
                        </div>

                        <div className="w-px h-6 bg-white/10"></div>

                        {/* Bot Status */}
                        <div className="flex items-center gap-2 text-sm">
                            <div className={clsx(
                                "w-2 h-2 rounded-full animate-pulse",
                                botStatus.running ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-red-500 shadow-[0_0_10px_#f87171]"
                            )} />
                            <span className="text-text-secondary font-mono tracking-wide">
                                {botStatus.running ? 'SYSTEM ACTIVE' : 'SYSTEM OFFLINE'}
                            </span>
                        </div>
                    </footer>


                    {/* Toasts */}
                    <div className="fixed top-20 right-4 z-[60] space-y-2">
                        {toasts.map((toast) => (
                            <div
                                key={toast.id}
                                className={clsx(
                                    'min-w-[220px] max-w-sm px-4 py-2 rounded-lg shadow-lg border text-sm flex items-start gap-2 bg-surface/95',
                                    toast.type === 'success' && 'border-green-400/40 text-green-200',
                                    toast.type === 'error' && 'border-red-400/40 text-red-200',
                                    toast.type === 'warning' &&
                                    'border-yellow-400/40 text-yellow-200',
                                )}
                            >
                                <div className="flex-1 break-words">{toast.message}</div>
                                <button
                                    onClick={() => removeToast(toast.id)}
                                    className="ml-2 text-xs text-text-dim hover:text-white"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </BotStatusContext.Provider>
        </ToastContext.Provider>
    );
};

export default Layout;
