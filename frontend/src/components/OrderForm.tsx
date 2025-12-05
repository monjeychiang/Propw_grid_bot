import React, { useState } from 'react';
import axios from 'axios';

interface OrderFormProps {
    disabled: boolean;
}

const OrderForm: React.FC<OrderFormProps> = ({ disabled }) => {
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleOrder = async (side: 'buy' | 'sell') => {
        if (!amount) return;
        setLoading(true);
        setMessage('');
        try {
            const res = await axios.post('/order', {
                side: side,
                amount: parseFloat(amount)
            });
            setMessage(`Success: ${JSON.stringify(res.data)}`);
        } catch (error: any) {
            setMessage(`Error: ${error.response?.data?.detail || error.message}`);
        }
        setLoading(false);
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Amount (USDT)</label>
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="Enter amount..."
                    disabled={disabled}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={() => handleOrder('buy')}
                    disabled={disabled || loading || !amount}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded font-bold transition"
                >
                    Buy / Long
                </button>
                <button
                    onClick={() => handleOrder('sell')}
                    disabled={disabled || loading || !amount}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded font-bold transition"
                >
                    Sell / Short
                </button>
            </div>

            {message && (
                <div className={`p-2 rounded text-sm ${message.startsWith('Error') ? 'bg-red-900/50 text-red-200' : 'bg-green-900/50 text-green-200'}`}>
                    {message}
                </div>
            )}
        </div>
    );
};

export default OrderForm;
