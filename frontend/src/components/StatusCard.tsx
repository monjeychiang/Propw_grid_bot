import React from 'react';

interface StatusProps {
    status: {
        running: boolean;
        logged_in: boolean;
        current_price: number | null;
    };
    loading: boolean;
    onStart: () => void;
    onStop: () => void;
}

const StatusCard: React.FC<StatusProps> = ({ status, loading, onStart, onStop }) => {
    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Bot Status</h2>
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <span>Running:</span>
                    <span className={`px-2 py-1 rounded text-sm ${status.running ? 'bg-green-500' : 'bg-red-500'}`}>
                        {status.running ? 'Active' : 'Stopped'}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span>Logged In:</span>
                    <span className={`px-2 py-1 rounded text-sm ${status.logged_in ? 'bg-green-500' : 'bg-yellow-500'}`}>
                        {status.logged_in ? 'Yes' : 'No'}
                    </span>
                </div>

                <div className="pt-4 flex gap-4">
                    {!status.running ? (
                        <button
                            onClick={onStart}
                            disabled={loading}
                            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 py-2 rounded font-bold transition"
                        >
                            {loading ? 'Starting...' : 'Start Bot'}
                        </button>
                    ) : (
                        <button
                            onClick={onStop}
                            disabled={loading}
                            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 py-2 rounded font-bold transition"
                        >
                            {loading ? 'Stopping...' : 'Stop Bot'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StatusCard;
