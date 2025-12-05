import { useState, useEffect, useCallback, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Strategy, Order, StrategyStats } from '../api/client';
import {
    fetchStrategy,
    fetchStrategyOrders,
    fetchStrategyStats,
    startStrategy,
    pauseStrategy,
    stopStrategy,
} from '../api/client';
import { BotStatusContext, ToastContext } from '../components/Layout';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    CREATED: { bg: 'bg-surface', text: 'text-text-secondary' },
    RUNNING: { bg: 'bg-buy/10', text: 'text-buy' },
    PAUSED: { bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
    STOPPED: { bg: 'bg-sell/10', text: 'text-sell' },
};

const ORDER_STATUS_COLORS: Record<string, string> = {
    SUBMITTING: 'text-primary bg-primary/10 border-primary/20',
    PENDING: 'text-primary bg-primary/10 border-primary/20',
    FILLED: 'text-buy bg-buy/10 border-buy/20',
    CANCELLED: 'text-text-dim bg-surface border-white/10',
    FAILED: 'text-sell bg-sell/10 border-sell/20',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
    SUBMITTING: '提交中',
    PENDING: '掛單中',
    FILLED: '已成交',
    CANCELLED: '已取消',
    FAILED: '失敗',
};

interface ConfirmModalState {
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
}

export default function StrategyDetailPage() {
    const { id } = useParams<{ id: string }>();
    const strategyId = Number(id);

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState<StrategyStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'orders' | 'stats'>('orders');
    const [orderFilter, setOrderFilter] = useState<string>('');

    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
        show: false,
        title: '',
        message: '',
        onConfirm: () => {},
    });

    const loadData = useCallback(async () => {
        if (!strategyId) return;
        try {
            const [strategyData, ordersData, statsData] = await Promise.all([
                fetchStrategy(strategyId),
                fetchStrategyOrders(strategyId, orderFilter || undefined),
                fetchStrategyStats(strategyId),
            ]);
            setStrategy(strategyData);
            setOrders(ordersData);
            setStats(statsData);
        } catch (error) {
            console.error('Failed to load strategy detail:', error);
        } finally {
            setLoading(false);
        }
    }, [strategyId, orderFilter]);

    // 週期性更新策略詳情與訂單、統計資料
    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 3000);
        return () => clearInterval(interval);
    }, [loadData]);

    const showConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmModal({ show: true, title, message, onConfirm });
    };

    const botStatus = useContext(BotStatusContext);
    const { showToast } = useContext(ToastContext);

    const handleAction = async (action: 'start' | 'pause' | 'stop') => {
        if (!strategy) return;

        const doAction = async () => {
            try {
                switch (action) {
                    case 'start':
                        await startStrategy(strategy.id);
                        break;
                    case 'pause':
                        await pauseStrategy(strategy.id);
                        break;
                    case 'stop':
                        await stopStrategy(strategy.id);
                        break;
                }
                loadData();
                const successText =
                    action === 'start'
                        ? '策略已送出啟動。'
                        : action === 'pause'
                        ? '策略已暫停。'
                        : '策略已停止。';
                showToast({ type: 'success', message: successText });
            } catch (error: any) {
                console.error('Failed to operate strategy:', error);
                const status = error?.response?.status as number | undefined;
                const detail = error?.response?.data?.detail as string | undefined;
                if (status === 503) {
                    showToast({
                        type: 'warning',
                        message: '系統正在處理掛單，暫時無法停止策略，請數秒後再試一次。',
                    });
                } else {
                    showToast({
                        type: 'error',
                        message: detail || '操作失敗，請稍後再試。',
                    });
                }
            }
        };

        if (action === 'stop') {
            showConfirm(
                '停止策略',
                '確定要停止此策略嗎？\n\n停止後 BOT 不會自動在交易所取消既有訂單，請到 Propw 或交易所確認，並視情況手動取消不需要的掛單或持倉，以避免資金異常。',
                doAction,
            );
        } else {
            doAction();
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    if (!strategy) {
        return (
            <div className="text-center py-12">
                <p className="text-text-secondary mb-3">找不到這個策略，可能已被刪除。</p>
                <Link to="/strategies" className="text-primary hover:underline">
                    返回策略列表
                </Link>
            </div>
        );
    }

    const statusStyle = STATUS_COLORS[strategy.status] || STATUS_COLORS.CREATED;
    const gridStep = (strategy.upper_price - strategy.lower_price) / strategy.grid_count;
    const currentPrice = botStatus.current_price ?? null;
    const gridLevels =
        strategy.grid_count > 0
            ? Array.from({ length: strategy.grid_count + 1 }, (_, i) => {
                  return (
                      strategy.lower_price +
                      (strategy.upper_price - strategy.lower_price) *
                          (i / strategy.grid_count)
                  );
              })
            : [];

    return (
        <div className="space-y-6">
            {/* 確認視窗 */}
            {confirmModal.show && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass-panel rounded-lg p-6 w-full max-w-md border border-sell/30 shadow-[0_0_30px_rgba(255,0,85,0.1)]">
                        <h3 className="text-lg font-semibold text-text-primary mb-2">
                            {confirmModal.title}
                        </h3>
                        <p className="text-text-secondary text-sm whitespace-pre-line mb-6">
                            {confirmModal.message}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() =>
                                    setConfirmModal((prev) => ({
                                        ...prev,
                                        show: false,
                                    }))
                                }
                                className="flex-1 px-4 py-2 border border-white/10 rounded-lg text-text-secondary hover:bg-white/5 transition-all"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => {
                                    confirmModal.onConfirm();
                                    setConfirmModal((prev) => ({
                                        ...prev,
                                        show: false,
                                    }));
                                }}
                                className="flex-1 px-4 py-2 bg-sell/20 text-sell border border-sell/30 rounded-lg hover:bg-sell/30 transition-all"
                            >
                                確認停止
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        to="/strategies"
                        className="text-text-dim hover:text-primary transition-colors"
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary">{strategy.name}</h1>
                        <p className="text-text-dim font-mono">{strategy.symbol}</p>
                    </div>
                    <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyle.bg} ${statusStyle.text} border border-current/20`}
                    >
                        {strategy.status === 'CREATED' && '已建立'}
                        {strategy.status === 'RUNNING' && '運行中'}
                        {strategy.status === 'PAUSED' && '已暫停'}
                        {strategy.status === 'STOPPED' && '已停止'}
                    </span>
                </div>

                <div className="flex gap-2">
                    {strategy.status === 'CREATED' && (
                        <button
                            onClick={() => handleAction('start')}
                            className="px-4 py-2 bg-buy/20 text-buy border border-buy/30 rounded-lg hover:bg-buy/30 transition-all"
                        >
                            啟動
                        </button>
                    )}
                    {strategy.status === 'RUNNING' && (
                        <>
                            <button
                                onClick={() => handleAction('pause')}
                                className="px-4 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/30 transition-all"
                            >
                                暫停
                            </button>
                            <button
                                onClick={() => handleAction('stop')}
                                className="px-4 py-2 bg-sell/20 text-sell border border-sell/30 rounded-lg hover:bg-sell/30 transition-all"
                            >
                                停止
                            </button>
                        </>
                    )}
                    {strategy.status === 'PAUSED' && (
                        <>
                            <button
                                onClick={() => handleAction('start')}
                                className="px-4 py-2 bg-buy/20 text-buy border border-buy/30 rounded-lg hover:bg-buy/30 transition-all"
                            >
                                重新啟動
                            </button>
                            <button
                                onClick={() => handleAction('stop')}
                                className="px-4 py-2 bg-sell/20 text-sell border border-sell/30 rounded-lg hover:bg-sell/30 transition-all"
                            >
                                停止
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-panel rounded-lg p-4">
                    <p className="text-sm text-text-dim">累計損益</p>
                    <p
                        className={`text-2xl font-bold font-mono ${
                            strategy.total_profit >= 0 ? 'text-buy' : 'text-sell'
                        }`}
                    >
                        {strategy.total_profit >= 0 ? '+' : ''}
                        {strategy.total_profit.toFixed(2)}
                        <span className="text-sm font-normal ml-1 text-text-secondary">
                            USDT
                        </span>
                    </p>
                </div>
                <div className="glass-panel rounded-lg p-4">
                    <p className="text-sm text-text-dim">成交次數</p>
                    <p className="text-2xl font-bold font-mono text-text-primary">
                        {strategy.total_trades}
                    </p>
                </div>
                <div className="glass-panel rounded-lg p-4">
                    <p className="text-sm text-text-dim">價格區間</p>
                    <p className="text-lg font-semibold font-mono text-text-primary">
                        {strategy.lower_price.toLocaleString()} -{' '}
                        {strategy.upper_price.toLocaleString()}
                    </p>
                </div>
                <div className="glass-panel rounded-lg p-4">
                    <p className="text-sm text-text-dim">單格價格間距</p>
                    <p className="text-lg font-semibold font-mono text-primary">
                        {gridStep.toFixed(0)} USDT
                        <span className="text-sm font-normal text-text-secondary ml-1">
                            ({((gridStep / strategy.lower_price) * 100).toFixed(2)}%)
                        </span>
                    </p>
                </div>
            </div>

            {/* Price Grid Visualization */}
            <div className="glass-panel rounded-lg p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2">價格網格示意</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto text-xs font-mono">
                    {gridLevels.map((level, index) => {
                        const isNear =
                            currentPrice != null &&
                            Math.abs(currentPrice - level) <= gridStep * 1.1;
                        const isAbove =
                            currentPrice != null && currentPrice > level + gridStep / 2;
                        const isBelow =
                            currentPrice != null && currentPrice < level - gridStep / 2;
                        return (
                            <div
                                key={index}
                                className={`flex items-center justify-between rounded px-2 py-1 ${
                                    isNear
                                        ? 'bg-primary/10 text-primary'
                                        : 'bg-surface/60 text-text-secondary'
                                }`}
                            >
                                <span>
                                    格 {index.toString().padStart(2, '0')} ·{' '}
                                    {level.toFixed(2)}
                                </span>
                                {currentPrice != null && (
                                    <span className="text-[10px]">
                                        {isNear
                                            ? '⚡ 即將可能成交'
                                            : isAbove
                                            ? '在價格下方'
                                            : isBelow
                                            ? '在價格上方'
                                            : ''}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-white/10">
                <nav className="flex gap-6">
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`py-3 border-b-2 font-medium text-sm transition-all ${
                            activeTab === 'orders'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-text-secondary hover:text-text-primary'
                        }`}
                    >
                        訂單紀錄 ({orders.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={`py-3 border-b-2 font-medium text-sm transition-all ${
                            activeTab === 'stats'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-text-secondary hover:text-text-primary'
                        }`}
                    >
                        策略統計
                    </button>
                </nav>
            </div>

            {/* Orders Tab */}
            {activeTab === 'orders' && (
                <div className="glass-panel rounded-lg overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-text-primary">訂單紀錄</h3>
                            <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded">
                                提醒：停止策略後，BOT 不會自動取消交易所既有訂單，請視情況手動處理。
                            </span>
                        </div>
                        <select
                            value={orderFilter}
                            onChange={(e) => setOrderFilter(e.target.value)}
                            className="px-3 py-1.5 bg-surface border border-white/10 rounded-lg text-text-primary text-sm focus:border-primary/50 transition-all"
                        >
                            <option value="">全部狀態</option>
                            <option value="SUBMITTING">提交中</option>
                            <option value="PENDING">掛單中</option>
                            <option value="FILLED">已成交</option>
                            <option value="CANCELLED">已取消</option>
                            <option value="FAILED">失敗</option>
                        </select>
                    </div>

                    {orders.length === 0 ? (
                        <div className="p-6 text-center text-text-dim text-sm">
                            目前沒有訂單紀錄。
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-surface text-text-dim border-b border-white/5">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-medium">ID</th>
                                        <th className="px-4 py-3 text-left font-medium">
                                            網格層級
                                        </th>
                                        <th className="px-4 py-3 text-left font-medium">方向</th>
                                        <th className="px-4 py-3 text-right font-medium">價格</th>
                                        <th className="px-4 py-3 text-right font-medium">數量</th>
                                        <th className="px-4 py-3 text-center font-medium">狀態</th>
                                        <th className="px-4 py-3 text-right font-medium">時間</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {orders.map((order) => (
                                        <tr
                                            key={order.id}
                                            className="hover:bg-white/5 transition-colors"
                                        >
                                            <td className="px-4 py-3 font-mono text-text-secondary">
                                                #{order.id}
                                            </td>
                                            <td className="px-4 py-3 text-center text-xs text-text-dim">
                                                {order.grid_level ?? '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`font-medium ${
                                                        order.side === 'BUY'
                                                            ? 'text-buy'
                                                            : 'text-sell'
                                                    }`}
                                                >
                                                    {order.side === 'BUY' ? '買入' : '賣出'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-text-primary">
                                                {order.price?.toLocaleString() ?? '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-text-secondary">
                                                {order.qty}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span
                                                    className={`px-2 py-0.5 rounded text-xs border ${
                                                        ORDER_STATUS_COLORS[order.status] || ''
                                                    }`}
                                                >
                                                    {ORDER_STATUS_LABELS[order.status] ||
                                                        order.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-text-dim text-xs">
                                                {new Date(order.created_at).toLocaleString(
                                                    'zh-TW',
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && stats && (
                <div className="glass-panel rounded-lg p-6">
                    <h3 className="font-semibold text-text-primary mb-4">策略統計</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <p className="text-sm text-text-dim">總報酬率</p>
                            <p
                                className={`text-xl font-bold font-mono ${
                                    stats.total_profit_percent >= 0 ? 'text-buy' : 'text-sell'
                                }`}
                            >
                                {stats.total_profit_percent >= 0 ? '+' : ''}
                                {stats.total_profit_percent.toFixed(2)}%
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-text-dim">勝率</p>
                            <p className="text-xl font-bold font-mono text-primary">
                                {stats.win_rate.toFixed(1)}%
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-text-dim">獲利筆數</p>
                            <p className="text-xl font-bold font-mono text-buy">
                                {stats.win_trades}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-text-dim">虧損筆數</p>
                            <p className="text-xl font-bold font-mono text-sell">
                                {stats.lose_trades}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-text-dim">平均每筆損益</p>
                            <p className="text-xl font-bold font-mono text-text-primary">
                                {stats.avg_profit_per_trade.toFixed(2)} USDT
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-text-dim">單筆最大獲利</p>
                            <p className="text-xl font-bold font-mono text-buy">
                                {stats.max_profit.toFixed(2)} USDT
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-text-dim">單筆最大虧損</p>
                            <p className="text-xl font-bold font-mono text-sell">
                                {stats.max_loss.toFixed(2)} USDT
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
