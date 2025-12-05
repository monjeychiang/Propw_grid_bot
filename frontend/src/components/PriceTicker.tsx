import React from 'react';

interface PriceProps {
    price: string | null;
}

const PriceTicker: React.FC<PriceProps> = ({ price }) => {
    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col justify-center items-center">
            <h2 className="text-xl font-semibold mb-2 text-gray-400">Current Price</h2>
            <div className="text-4xl font-mono font-bold text-yellow-400">
                {price || "---"}
            </div>
            <div className="text-sm text-gray-500 mt-2">BTC/USDT</div>
        </div>
    );
};

export default PriceTicker;
