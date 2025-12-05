import React, { createContext, useContext, useState, useCallback } from 'react';

interface Toast {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
}

interface ToastContextValue {
    toasts: Toast[];
    showToast: (type: Toast['type'], message: string) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within ToastProvider');
    return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((type: Toast['type'], message: string) => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, type, message }]);

        // 自動移除
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
};

// Toast 容器組件
const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: string) => void }> = ({ toasts, onRemove }) => {
    if (toasts.length === 0) return null;

    const typeStyles = {
        success: 'bg-buy/20 border-buy/30 text-buy',
        error: 'bg-sell/20 border-sell/30 text-sell',
        warning: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
        info: 'bg-primary/20 border-primary/30 text-primary',
    };

    const typeIcons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
    };

    return (
        <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`
                        pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-md
                        shadow-lg animate-slide-in min-w-[280px] max-w-[400px]
                        ${typeStyles[toast.type]}
                    `}
                    onClick={() => onRemove(toast.id)}
                >
                    <span className="text-lg">{typeIcons[toast.type]}</span>
                    <span className="text-sm font-medium flex-1">{toast.message}</span>
                    <button className="opacity-60 hover:opacity-100 text-xs">✕</button>
                </div>
            ))}
        </div>
    );
};

export default ToastProvider;
