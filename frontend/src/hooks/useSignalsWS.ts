import { useEffect, useState } from 'react';
import type { Signal } from '../api/client';

export const useSignalsWS = (initialSignals: Signal[] = []) => {
    const [signals, setSignals] = useState<Signal[]>(initialSignals);

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:8000/ws/signals');

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'signal_created') {
                    setSignals((prev) => [message.data, ...prev]);
                } else if (message.type === 'signal_updated') {
                    setSignals((prev) =>
                        prev.map((s) => (s.id === message.data.id ? message.data : s))
                    );
                }
            } catch (error) {
                console.error('WS Error:', error);
            }
        };

        return () => {
            ws.close();
        };
    }, []);

    return { signals, setSignals };
};
