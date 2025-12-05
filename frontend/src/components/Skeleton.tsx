import React from 'react';

// 策略卡片骨架屏
export const StrategyCardSkeleton: React.FC = () => (
    <div className="glass-panel rounded-lg p-4 animate-pulse">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
            <div>
                <div className="h-5 w-32 bg-white/10 rounded mb-2"></div>
                <div className="h-4 w-20 bg-white/5 rounded"></div>
            </div>
            <div className="h-6 w-16 bg-white/10 rounded-full"></div>
        </div>

        {/* Price Range */}
        <div className="bg-surface rounded p-3 border border-white/5 mb-3">
            <div className="h-3 w-16 bg-white/5 rounded mb-2"></div>
            <div className="h-2 w-full bg-white/10 rounded-full mb-2"></div>
            <div className="flex justify-between">
                <div className="h-3 w-16 bg-white/5 rounded"></div>
                <div className="h-3 w-20 bg-white/10 rounded"></div>
                <div className="h-3 w-16 bg-white/5 rounded"></div>
            </div>
        </div>

        {/* Grid Info */}
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

        {/* Stats */}
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

        {/* Actions */}
        <div className="flex gap-2 pt-3 border-t border-white/5">
            <div className="flex-1 h-8 bg-white/10 rounded"></div>
            <div className="w-16 h-8 bg-white/5 rounded"></div>
        </div>
    </div>
);

// 訂單列表骨架屏
export const OrderRowSkeleton: React.FC = () => (
    <tr className="animate-pulse">
        <td className="px-4 py-3"><div className="h-4 w-8 bg-white/10 rounded"></div></td>
        <td className="px-4 py-3"><div className="h-4 w-16 bg-white/10 rounded"></div></td>
        <td className="px-4 py-3"><div className="h-4 w-12 bg-white/10 rounded"></div></td>
        <td className="px-4 py-3"><div className="h-4 w-20 bg-white/10 rounded"></div></td>
        <td className="px-4 py-3"><div className="h-4 w-16 bg-white/10 rounded"></div></td>
        <td className="px-4 py-3"><div className="h-5 w-16 bg-white/10 rounded"></div></td>
        <td className="px-4 py-3"><div className="h-4 w-24 bg-white/5 rounded"></div></td>
    </tr>
);

// 詳情頁骨架屏
export const DetailPageSkeleton: React.FC = () => (
    <div className="space-y-6 animate-pulse">
        {/* Header */}
        <div className="flex justify-between items-start">
            <div>
                <div className="h-8 w-48 bg-white/10 rounded mb-2"></div>
                <div className="h-4 w-32 bg-white/5 rounded"></div>
            </div>
            <div className="h-8 w-20 bg-white/10 rounded-full"></div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="glass-panel rounded-lg p-4">
                    <div className="h-3 w-16 bg-white/5 rounded mb-2"></div>
                    <div className="h-6 w-24 bg-white/10 rounded"></div>
                </div>
            ))}
        </div>

        {/* Table */}
        <div className="glass-panel rounded-lg overflow-hidden">
            <div className="bg-surface border-b border-white/5 p-4">
                <div className="h-5 w-32 bg-white/10 rounded"></div>
            </div>
            <table className="w-full">
                <thead className="bg-surface/50">
                    <tr>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <th key={i} className="px-4 py-3">
                                <div className="h-4 w-16 bg-white/5 rounded"></div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {[1, 2, 3, 4, 5].map(i => (
                        <OrderRowSkeleton key={i} />
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

// 通用載入骨架
export const CardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`glass-panel rounded-lg p-4 animate-pulse ${className}`}>
        <div className="h-4 w-3/4 bg-white/10 rounded mb-3"></div>
        <div className="h-3 w-1/2 bg-white/5 rounded mb-2"></div>
        <div className="h-3 w-2/3 bg-white/5 rounded"></div>
    </div>
);
