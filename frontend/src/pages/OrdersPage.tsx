import { useState, useEffect, useCallback } from 'react';
import type { Order } from '../api/client';
import { api } from '../api/client';

const ORDER_STATUS_COLORS: Record<string, string> = {
    PENDING: 'text-primary bg-primary/10 border-primary/20',
    FILLED: 'text-buy bg-buy/10 border-buy/20',
    CANCELLED: 'text-text-dim bg-surface border-white/10',
    FAILED: 'text-sell bg-sell/10 border-sell/20',
};

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('');

    const loadOrders = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            const res = await api.get(`/orders?${params.toString()}`);
            setOrders(res.data.items || []);
        } catch (error) {
            console.error('Failed to load orders:', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        loadOrders();
        const interval = setInterval(loadOrders, 5000);
        return () => clearInterval(interval);
    }, [loadOrders]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">訂單記錄</h1>
                    <p className="text-text-secondary mt-1">查看所有訂單的執行狀態</p>
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-surface border border-white/10 rounded-lg text-text-primary focus:border-primary/50 transition-all"
                >
                    <option value="">全部狀態</option>
                    <option value="PENDING">掛單中</option>
                    <option value="FILLED">已成交</option>
                    <option value="CANCELLED">已取消</option>
                    <option value="FAILED">失敗</option>
                </select>
            </div>

            {/* Warning */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-yellow-400 text-sm">
                ⚠️ 取消訂單請至 Propw 網站操作
            </div>

            {/* Orders Table */}
            <div className="glass-panel rounded-lg overflow-hidden">
                {orders.length === 0 ? (
                    <div className="p-8 text-center text-text-dim">
                        暫無訂單記錄
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-surface text-text-dim border-b border-white/5">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">ID</th>
                                    <th className="px-4 py-3 text-left font-medium">策略</th>
                                    <th className="px-4 py-3 text-left font-medium">方向</th>
                                    <th className="px-4 py-3 text-right font-medium">價格</th>
                                    <th className="px-4 py-3 text-right font-medium">數量</th>
                                    <th className="px-4 py-3 text-center font-medium">狀態</th>
                                    <th className="px-4 py-3 text-right font-medium">時間</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {orders.map(order => (
                                    <tr key={order.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-3 font-mono text-text-secondary">#{order.id}</td>
                                        <td className="px-4 py-3 text-text-secondary">
                                            {order.strategy_id ? (
                                                <a href={`/strategies/${order.strategy_id}`} className="text-primary hover:underline">
                                                    策略 #{order.strategy_id}
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`font-medium ${order.side === 'BUY' ? 'text-buy' : 'text-sell'}`}>
                                                {order.side === 'BUY' ? '買入' : '賣出'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-text-primary">
                                            {order.price?.toLocaleString() || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-text-secondary">
                                            {order.qty}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded text-xs border ${ORDER_STATUS_COLORS[order.status] || ''}`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-text-dim text-xs">
                                            {new Date(order.created_at).toLocaleString('zh-TW')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
