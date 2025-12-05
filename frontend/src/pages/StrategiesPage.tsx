import { useState, useEffect, useCallback, useContext } from 'react';
import { Link } from 'react-router-dom';
import type { Strategy, StrategyCreateData } from '../api/client';
import {
    fetchStrategies,
    createStrategy,
    startStrategy,
    stopStrategy,
    deleteStrategy,
} from '../api/client';
import { BotStatusContext, ToastContext } from '../components/Layout';

type PricePosition = {
    percent: number;
    status: 'below' | 'within' | 'above';
    nearEdge: boolean;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    CREATED: { bg: 'bg-surface', text: 'text-text-secondary', dot: 'bg-text-secondary' },
    RUNNING: { bg: 'bg-buy/10', text: 'text-buy', dot: 'bg-buy' },
    PAUSED: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-400' },
    STOPPED: { bg: 'bg-sell/10', text: 'text-sell', dot: 'bg-sell' },
};

const STATUS_LABELS: Record<string, string> = {
    CREATED: '已建立',
    RUNNING: '運行中',
    PAUSED: '已暫停',
    STOPPED: '已停止',
};

interface ConfirmModalState {
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
}

export default function StrategiesPage() {
    const botStatus = useContext(BotStatusContext);
    const { showToast } = useContext(ToastContext);
    const currentPrice = botStatus.current_price ?? null;

    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
    const [showIntro, setShowIntro] = useState(false);

    const [formData, setFormData] = useState<StrategyCreateData>({
        name: '',
        symbol: 'BTCUSDT',
        upper_price: 100000,
        lower_price: 90000,
        grid_count: 10,
        investment_per_grid: 100,
    });

    // Add missing state for startup progress
    const [startingStrategyId, setStartingStrategyId] = useState<number | null>(null);
    const [startingProgress, setStartingProgress] = useState({ current: 0, total: 0 });

    const loadStrategies = useCallback(async () => {
        try {
            const data = await fetchStrategies();
            setStrategies(data);
        } catch (error) {
            console.error('Failed to load strategies:', error);
            setErrorMessage('讀取策略列表失敗，請稍後再試。');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStrategies();
        const interval = setInterval(loadStrategies, 15000);
        return () => clearInterval(interval);
    }, [loadStrategies]);

    useEffect(() => {
        const flag = localStorage.getItem('propw_strategies_intro_shown');
        if (!flag) {
            setShowIntro(true);
        }
    }, []);

    // 將錯誤訊息同步到全域 toast，讓使用者更容易注意到
    useEffect(() => {
        if (errorMessage) {
            showToast({ type: 'error', message: errorMessage });
        }
    }, [errorMessage, showToast]);

    // Monitor WebSocket messages for startup progress
    useEffect(() => {
        if (!botStatus.lastMessage) return;
        const msg = botStatus.lastMessage;

        if (msg.type === 'order_created' && msg.data && msg.data.strategy_id === startingStrategyId) {
            setStartingProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }

        if (msg.type === 'strategy_started' && msg.data && msg.data.strategy_id === startingStrategyId) {
            setStartingStrategyId(null); // Finished
            setStartingProgress({ current: 0, total: 0 });
            loadStrategies(); // Refresh to ensure status is up to date
            showToast({ type: 'success', message: '策略啟動完成，所有初始訂單已掛出。' });
        }
    }, [botStatus.lastMessage, startingStrategyId, showToast, loadStrategies]);

    const getPricePosition = (lower: number, upper: number): PricePosition => {
        if (!currentPrice || lower >= upper) {
            return { percent: 50, status: 'within', nearEdge: false };
        }
        if (currentPrice < lower) {
            return { percent: 0, status: 'below', nearEdge: true };
        }
        if (currentPrice > upper) {
            return { percent: 100, status: 'above', nearEdge: true };
        }
        const raw = ((currentPrice - lower) / (upper - lower)) * 100;
        const percent = Math.max(0, Math.min(100, raw));
        const nearEdge = percent < 10 || percent > 90;
        return { percent, status: 'within', nearEdge };
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        try {
            await createStrategy(formData);
            setShowCreate(false);
            setFormData({
                name: '',
                symbol: 'BTCUSDT',
                upper_price: 100000,
                lower_price: 90000,
                grid_count: 10,
                investment_per_grid: 100,
            });
            loadStrategies();
        } catch (error) {
            console.error('Failed to create strategy:', error);
            setErrorMessage('建立策略失敗，請稍後再試。');
        }
    };

    const showConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmModal({ show: true, title, message, onConfirm });
    };

    const executeAction = async (id: number, action: 'start' | 'stop' | 'delete') => {
        setActionLoading(id);
        setErrorMessage(null);

        try {
            switch (action) {
                case 'start':
                    await startStrategy(id);
                    // Do NOT clear actionLoading here for 'start', let the WS event clear 'startingStrategyId'
                    // Actually, 'actionLoading' blocks the button, 'startingStrategyId' changes the text.
                    // We should clear actionLoading so the button state logic can handover to startingStrategyId
                    break;
                case 'stop':
                    await stopStrategy(id);
                    await loadStrategies();
                    showToast({ type: 'success', message: '策略已停止。' });
                    break;
                case 'delete':
                    await deleteStrategy(id);
                    await loadStrategies();
                    showToast({ type: 'success', message: '策略已刪除。' });
                    break;
            }
        } catch (error: any) {
            console.error(`Failed to ${action} strategy:`, error);
            // If start failed, reset progress
            if (action === 'start') {
                setStartingStrategyId(null);
            }

            const status = error?.response?.status as number | undefined;
            const detail = error?.response?.data?.detail as string | undefined;

            if (status === 503) {
                showToast({ type: 'warning', message: '系統忙碌中，請稍後再試。' });
            } else {
                showToast({ type: 'error', message: detail || '操作失敗，請稍後再試。' });
            }
            // If failed, make sure to reload to match server state
            loadStrategies();
        } finally {
            setActionLoading(null);
        }
    };

    const handleAction = async (id: number, action: 'start' | 'stop' | 'delete') => {
        if (action === 'delete') {
            const strategy = strategies.find(s => s.id === id);
            if (!strategy) return;

            showConfirm(
                '刪除策略',
                `確定要刪除策略 "${strategy.name}" 嗎？\n此動作無法復原。`,
                () => executeAction(id, action)
            );
            return;
        }

        if (action === 'stop') {
            showConfirm(
                '停止策略',
                '確定要停止此策略嗎？\n\n停止後 BOT 將不會繼續執行此策略，也不會再依此策略在交易所建立新訂單。',
                () => executeAction(id, action)
            );
            return;
        }

        if (action === 'start') {
            const strategy = strategies.find(s => s.id === id);
            if (strategy) {
                setStartingStrategyId(id);
                setStartingProgress({ current: 0, total: strategy.grid_count });
            }
        }

        executeAction(id, action);
    };

    const gridStep =
        formData.upper_price &&
            formData.lower_price &&
            formData.grid_count
            ? (formData.upper_price - formData.lower_price) / formData.grid_count
            : 0;

    const gridStepPercent =
        formData.lower_price && gridStep
            ? (gridStep / formData.lower_price) * 100
            : 0;

    const totalInvestment = formData.grid_count * formData.investment_per_grid;

    if (loading) {
        return (
            <div className="space-y-6">
                {/* Header Skeleton */}
                <div className="flex justify-between items-center">
                    <div>
                        <div className="h-8 w-32 bg-white/10 rounded animate-pulse mb-2"></div>
                        <div className="h-4 w-48 bg-white/5 rounded animate-pulse"></div>
                    </div>
                    <div className="h-10 w-28 bg-white/10 rounded-lg animate-pulse"></div>
                </div>
                {/* Cards Skeleton */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="glass-panel rounded-lg p-4 animate-pulse">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <div className="h-5 w-32 bg-white/10 rounded mb-2"></div>
                                    <div className="h-4 w-20 bg-white/5 rounded"></div>
                                </div>
                                <div className="h-6 w-16 bg-white/10 rounded-full"></div>
                            </div>
                            <div className="bg-surface rounded p-3 border border-white/5 mb-3">
                                <div className="h-3 w-16 bg-white/5 rounded mb-2"></div>
                                <div className="h-2 w-full bg-white/10 rounded-full mb-2"></div>
                                <div className="flex justify-between">
                                    <div className="h-3 w-16 bg-white/5 rounded"></div>
                                    <div className="h-3 w-20 bg-white/10 rounded"></div>
                                    <div className="h-3 w-16 bg-white/5 rounded"></div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-surface rounded p-2 border border-white/5">
                                    <div className="h-3 w-12 bg-white/5 rounded mb-1"></div>
                                    <div className="h-4 w-16 bg-white/10 rounded"></div>
                                </div>
                                <div className="bg-surface rounded p-2 border border-white/5">
                                    <div className="h-3 w-12 bg-white/5 rounded mb-1"></div>
                                    <div className="h-4 w-20 bg-white/10 rounded"></div>
                                </div>
                            </div>
                            <div className="flex justify-between mb-4">
                                <div>
                                    <div className="h-3 w-12 bg-white/5 rounded mb-1"></div>
                                    <div className="h-5 w-24 bg-white/10 rounded"></div>
                                </div>
                                <div className="text-right">
                                    <div className="h-3 w-12 bg-white/5 rounded mb-1"></div>
                                    <div className="h-5 w-8 bg-white/10 rounded"></div>
                                </div>
                            </div>
                            <div className="flex gap-2 pt-3 border-t border-white/5">
                                <div className="flex-1 h-8 bg-white/10 rounded"></div>
                                <div className="w-16 h-8 bg-white/5 rounded"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* 錯誤訊息 */}
            {errorMessage && (
                <div className="glass-panel border-l-4 border-l-red-500 bg-red-500/10 px-6 py-4 rounded-xl text-sm text-red-200 shadow-lg flex items-center gap-3">
                    <span className="text-xl">⚠️</span> {errorMessage}
                </div>
            )}

            {/* 確認視窗 */}
            {confirmModal?.show && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60]">
                    <div className="glass-panel p-8 w-full max-w-md shadow-2xl animate-fade-in">
                        <h3 className="text-xl font-bold text-white mb-3">
                            {confirmModal.title}
                        </h3>
                        <p className="text-text-secondary whitespace-pre-line mb-8 leading-relaxed">
                            {confirmModal.message}
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setConfirmModal(null)}
                                className="flex-1 px-4 py-3 border border-white/10 rounded-xl text-text-secondary hover:bg-white/5 hover:text-white transition-all font-medium"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => {
                                    confirmModal.onConfirm();
                                    setConfirmModal(null);
                                }}
                                className="flex-1 px-4 py-3 bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl hover:bg-red-500/30 hover:shadow-[0_0_15px_rgba(248,113,113,0.2)] transition-all font-medium"
                            >
                                確認
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 引導視窗 */}
            {showIntro && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60]">
                    <div className="glass-panel p-8 w-full max-w-lg shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary"></div>
                        <h2 className="text-2xl font-bold text-white mb-4">
                            歡迎使用 PropW Bot
                        </h2>
                        <p className="text-text-secondary mb-6 leading-relaxed">
                            這是一個自動化網格交易機器人。請先確認：
                            <br />
                            1. Bot 背後已連接到正確的交易所帳戶 (模擬/實盤)
                            <br />
                            2. 您的帳戶有足夠的 USDT 餘額
                        </p>
                        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-8">
                            <p className="text-sm text-primary flex items-start gap-2">
                                <span className="mt-0.5">💡</span>
                                建議先從小額資金開始測試策略。
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                setShowIntro(false);
                                localStorage.setItem('propw_strategies_intro_shown', 'true');
                            }}
                            className="w-full py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary/90 shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-all"
                        >
                            開始使用
                        </button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2 flex items-center gap-3">
                        <span className="w-2 h-8 bg-primary rounded-full"></span>
                        交易策略
                    </h1>
                    <p className="text-text-secondary text-base">
                        管理您的自動化網格交易機器人
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-6 py-3 bg-primary text-black font-bold rounded-full hover:bg-primary/90 shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-all flex items-center gap-2"
                >
                    <span className="text-xl leading-none">+</span> 建立新策略
                </button>
            </div>

            {/* 建立策略表單 */}
            {showCreate && (
                <div className="glass-panel p-8 animate-slide-in relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <span className="text-primary">#</span> 設定策略參數
                    </h2>

                    <form onSubmit={handleCreate} className="space-y-8 relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-text-secondary ml-1">策略名稱</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 text-white placeholder-text-dim transition-all focus:ring-0"
                                    placeholder="例如：BTC 穩健網格"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-text-secondary ml-1">交易對</label>
                                <select
                                    value={formData.symbol}
                                    onChange={e => setFormData({ ...formData, symbol: e.target.value })}
                                    className="w-full px-4 py-3 text-white transition-all focus:ring-0 appearance-none"
                                >
                                    <option value="BTCUSDT">BTC/USDT</option>
                                    <option value="ETHUSDT">ETH/USDT</option>
                                    <option value="SOLUSDT">SOL/USDT</option>
                                    <option value="DOGEUSDT">DOGE/USDT</option>
                                </select>
                            </div>

                            {/* 價格範圍 */}
                            <div className="md:col-span-2 p-6 rounded-2xl bg-black/20 border border-white/5">
                                <h3 className="text-sm font-bold text-text-secondary mb-4 uppercase tracking-wider">價格範圍設定</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">價格下限 (USDT)</label>
                                        <input
                                            type="number"
                                            required
                                            value={formData.lower_price}
                                            onChange={e =>
                                                setFormData({ ...formData, lower_price: Number(e.target.value) })
                                            }
                                            className="w-full px-4 py-3 text-white font-mono transition-all focus:ring-0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-text-secondary ml-1">價格上限 (USDT)</label>
                                        <input
                                            type="number"
                                            required
                                            value={formData.upper_price}
                                            onChange={e =>
                                                setFormData({ ...formData, upper_price: Number(e.target.value) })
                                            }
                                            className="w-full px-4 py-3 text-white font-mono transition-all focus:ring-0"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-text-secondary ml-1">網格數量</label>
                                <input
                                    type="number"
                                    required
                                    min="2"
                                    max="50"
                                    value={formData.grid_count}
                                    onChange={e =>
                                        setFormData({ ...formData, grid_count: Number(e.target.value) })
                                    }
                                    className="w-full px-4 py-3 text-white font-mono transition-all focus:ring-0"
                                />
                                <p className="text-xs text-text-dim ml-1">建議 5-20 格</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-text-secondary ml-1">每格投資額 (USDT)</label>
                                <input
                                    type="number"
                                    required
                                    min="10"
                                    value={formData.investment_per_grid}
                                    onChange={e =>
                                        setFormData({ ...formData, investment_per_grid: Number(e.target.value) })
                                    }
                                    className="w-full px-4 py-3 text-white font-mono transition-all focus:ring-0"
                                />
                            </div>
                        </div>

                        {/* 預覽資訊 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                                <div className="text-xs text-text-secondary mb-1">網格價差</div>
                                <div className="text-lg font-bold font-mono text-primary">
                                    {gridStep.toFixed(2)} <span className="text-xs opacity-70">USDT</span>
                                </div>
                                <div className="text-xs text-primary/70 mt-1">
                                    {gridStepPercent.toFixed(2)}%
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/10">
                                <div className="text-xs text-text-secondary mb-1">總投資額</div>
                                <div className="text-lg font-bold font-mono text-secondary">
                                    {totalInvestment.toLocaleString()} <span className="text-xs opacity-70">USDT</span>
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                                <button
                                    type="submit"
                                    className="w-full h-full py-2 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-lg hover:opacity-90 shadow-[0_0_15px_rgba(56,189,248,0.3)] transition-all"
                                >
                                    確認建立
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* 策略列表 */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {strategies.map(strategy => {
                    const pricePos = getPricePosition(
                        strategy.lower_price,
                        strategy.upper_price,
                    );
                    const statusStyle = STATUS_COLORS[strategy.status] || STATUS_COLORS.CREATED;

                    return (
                        <div
                            key={strategy.id}
                            className={`glass-panel p-6 transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(0,0,0,0.3)] group relative overflow-hidden`}
                        >
                            {/* Hover Glow Effect */}
                            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-500 pointer-events-none"></div>

                            {/* Header */}
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">
                                            {strategy.name}
                                        </h3>
                                        <span className="px-2 py-0.5 rounded-md text-[10px] bg-white/10 text-text-secondary font-mono border border-white/5">
                                            #{strategy.id}
                                        </span>
                                    </div>
                                    <p className="text-xs font-mono text-text-secondary bg-black/20 px-2 py-1 rounded inline-block">
                                        {strategy.symbol}
                                    </p>
                                </div>
                                <div
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${statusStyle.bg} ${statusStyle.text} border border-white/5 shadow-sm`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} animate-pulse`}></span>
                                    {STATUS_LABELS[strategy.status] || strategy.status}
                                </div>
                            </div>

                            {/* Price Range Visualizer */}
                            <div className="bg-black/20 rounded-xl p-4 border border-white/5 mb-6 relative hover:border-white/10 transition-colors">
                                <div className="flex justify-between text-xs text-text-secondary mb-3 font-mono">
                                    <span className="opacity-70">區間下限</span>
                                    <span className="flex items-center gap-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${pricePos.status === 'within' ? 'bg-emerald-400' :
                                            pricePos.status === 'below' ? 'bg-red-400' : 'bg-yellow-400'
                                            }`}></span>
                                        {pricePos.status === 'within' ? '區間內' :
                                            pricePos.status === 'below' ? '低於區間' : '高於區間'}
                                    </span>
                                    <span className="opacity-70">區間上限</span>
                                </div>

                                {/* Progress Bar */}
                                <div className="h-3 bg-white/5 rounded-full relative overflow-hidden mb-3 ring-1 ring-white/5">
                                    {/* Range Fill */}
                                    <div className="absolute inset-y-0 left-0 bg-white/5 w-full"></div>

                                    {/* Current Price Indicator */}
                                    {currentPrice && (
                                        <div
                                            className="absolute top-0 bottom-0 w-1.5 bg-primary shadow-[0_0_10px_#38bdf8] transition-all duration-1000 ease-out rounded-full z-10"
                                            style={{
                                                left: `calc(${pricePos.percent}% - 3px)`,
                                                opacity: pricePos.status === 'within' ? 1 : 0.5
                                            }}
                                        ></div>
                                    )}
                                </div>

                                <div className="flex justify-between font-mono text-sm leading-none">
                                    <span className="text-text-dim">${strategy.lower_price.toLocaleString()}</span>
                                    <span className={`font-bold transition-colors ${pricePos.status === 'within' ? 'text-primary' : 'text-text-dim'
                                        }`}>
                                        ${currentPrice?.toLocaleString() || '--'}
                                    </span>
                                    <span className="text-text-dim">${strategy.upper_price.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <div className="p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                    <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">投資額</div>
                                    <div className="font-mono text-sm font-medium text-white">
                                        ${(strategy.grid_count * strategy.investment_per_grid).toLocaleString()}
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                    <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">網格數</div>
                                    <div className="font-mono text-sm font-medium text-white">
                                        {strategy.grid_count} <span className="opacity-50 text-[10px]">格</span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats (Realtime) - Placeholder */}
                            <div className="flex justify-between items-center mb-6 pt-4 border-t border-white/5">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-0.5">總盈虧 (預估)</div>
                                    <div className="text-lg font-bold font-mono text-text-secondary">--</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-0.5">運行時間</div>
                                    <div className="text-sm font-mono text-text-secondary">--:--:--</div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                                <Link
                                    to={`/strategies/${strategy.id}`}
                                    className="flex-1 text-center py-2.5 rounded-lg bg-white/5 text-text-secondary text-sm font-medium hover:bg-white/10 hover:text-white transition-all"
                                >
                                    詳細資訊
                                </Link>

                                {strategy.status === 'CREATED' && (
                                    <button
                                        onClick={() => handleAction(strategy.id, 'start')}
                                        disabled={actionLoading === strategy.id || startingStrategyId === strategy.id}
                                        className="flex-1 py-2.5 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm font-bold hover:bg-emerald-500/30 hover:shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all disabled:opacity-50 border border-emerald-500/20"
                                    >
                                        {actionLoading === strategy.id ? '請求中...' :
                                            startingStrategyId === strategy.id ? `啟動中 (${startingProgress.current}/${startingProgress.total})` :
                                                '啟動'}
                                    </button>
                                )}

                                {strategy.status === 'RUNNING' && (
                                    <button
                                        onClick={() => handleAction(strategy.id, 'stop')}
                                        disabled={actionLoading === strategy.id}
                                        className="flex-1 py-2.5 bg-amber-500/20 text-amber-300 rounded-lg text-sm font-bold hover:bg-amber-500/30 transition-all disabled:opacity-50 border border-amber-500/20"
                                    >
                                        {actionLoading === strategy.id ? '停止中...' : '停止'}
                                    </button>
                                )}

                                {strategy.status === 'STOPPED' && (
                                    <button
                                        onClick={() => handleAction(strategy.id, 'delete')}
                                        disabled={actionLoading === strategy.id}
                                        className="w-10 h-10 flex items-center justify-center bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50 border border-red-500/20"
                                        title="刪除"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
