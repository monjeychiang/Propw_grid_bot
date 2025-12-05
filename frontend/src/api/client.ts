import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export interface Order {
    id: number;
    strategy_id: number | null;
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number | null;
    qty: number;
    order_type: 'MARKET' | 'LIMIT';
    status: 'SUBMITTING' | 'PENDING' | 'FILLED' | 'CANCELLED' | 'FAILED';
    exchange_order_id: string | null;
    error_message: string | null;
    grid_level: number | null;
    created_at: string;
}

export interface Strategy {
    id: number;
    name: string;
    symbol: string;
    type: string;
    status: 'CREATED' | 'RUNNING' | 'PAUSED' | 'STOPPED';
    upper_price: number;
    lower_price: number;
    grid_count: number;
    investment_per_grid: number;
    stop_loss: number | null;
    take_profit: number | null;
    max_orders: number;
    total_profit: number;
    total_trades: number;
    created_at: string;
    started_at: string | null;
    stopped_at: string | null;
}

export interface StrategyStats {
    total_profit: number;
    total_profit_percent: number;
    total_trades: number;
    win_trades: number;
    lose_trades: number;
    win_rate: number;
    avg_profit_per_trade: number;
    max_profit: number;
    max_loss: number;
}

export interface StrategyCreateData {
    name: string;
    symbol?: string;
    upper_price: number;
    lower_price: number;
    grid_count: number;
    investment_per_grid: number;
    stop_loss?: number | null;
    take_profit?: number | null;
}

// Order API
export const fetchOrders = async () => {
    const response = await api.get<{ items: Order[] }>('/orders');
    return response.data.items;
};

// Bot API
export const loginBot = async (email: string, password: string) => {
    const response = await api.post('/bot/login', { email, password });
    return response.data;
};

// Strategy API
export const fetchStrategies = async (status?: string) => {
    const params = status ? { status } : {};
    const response = await api.get<{ items: Strategy[] }>('/strategies', { params });
    return response.data.items;
};

export const fetchStrategy = async (strategyId: number) => {
    const response = await api.get<Strategy>(`/strategies/${strategyId}`);
    return response.data;
};

export const createStrategy = async (data: StrategyCreateData) => {
    const response = await api.post<Strategy>('/strategies', data);
    return response.data;
};

export const deleteStrategy = async (strategyId: number) => {
    const response = await api.delete(`/strategies/${strategyId}`);
    return response.data;
};

export const startStrategy = async (strategyId: number) => {
    const response = await api.post(`/strategies/${strategyId}/start`);
    return response.data;
};

export const pauseStrategy = async (strategyId: number) => {
    const response = await api.post(`/strategies/${strategyId}/pause`);
    return response.data;
};

export const stopStrategy = async (strategyId: number) => {
    const response = await api.post(`/strategies/${strategyId}/stop`);
    return response.data;
};

export const fetchStrategyOrders = async (strategyId: number, status?: string) => {
    const params = status ? { status } : {};
    const response = await api.get<Order[]>(`/strategies/${strategyId}/orders`, { params });
    return response.data;
};

export const fetchStrategyStats = async (strategyId: number) => {
    const response = await api.get<StrategyStats>(`/strategies/${strategyId}/stats`);
    return response.data;
};

