import datetime as dt
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class OrderBase(BaseModel):
    strategy_id: Optional[int] = None
    side: str = Field(..., pattern="^(BUY|SELL)$")
    price: Optional[float] = None
    qty: float
    order_type: str = Field(default="LIMIT", pattern="^(LIMIT|MARKET)$")


class OrderCreate(OrderBase):
    pass


class Order(OrderBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    symbol: str
    status: str
    exchange_order_id: Optional[str] = None
    error_message: Optional[str] = None
    grid_level: Optional[int] = None
    paired_order_id: Optional[int] = None
    is_entry: Optional[bool] = True
    created_at: dt.datetime
    updated_at: dt.datetime


class OrdersResponse(BaseModel):
    items: List[Order]


# ==================== Strategy Schemas ====================

class StrategyBase(BaseModel):
    """策略基礎欄位"""
    name: str = Field(..., min_length=1, max_length=100)
    symbol: str = Field(default="BTCUSDT")
    upper_price: float = Field(..., gt=0)
    lower_price: float = Field(..., gt=0)
    grid_count: int = Field(..., ge=2, le=100)
    investment_per_grid: float = Field(..., gt=0)
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    max_orders: int = Field(default=50, ge=1, le=200)


class StrategyCreate(StrategyBase):
    """創建策略請求"""
    pass


class StrategyUpdate(BaseModel):
    """更新策略請求（所有欄位可選）"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    upper_price: Optional[float] = Field(None, gt=0)
    lower_price: Optional[float] = Field(None, gt=0)
    grid_count: Optional[int] = Field(None, ge=2, le=100)
    investment_per_grid: Optional[float] = Field(None, gt=0)
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    max_orders: Optional[int] = Field(None, ge=1, le=200)


class StrategyResponse(StrategyBase):
    """策略響應"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    status: str
    total_profit: float
    total_trades: int
    created_at: dt.datetime
    started_at: Optional[dt.datetime] = None
    stopped_at: Optional[dt.datetime] = None
    updated_at: dt.datetime


class StrategiesResponse(BaseModel):
    """策略列表響應"""
    items: List[StrategyResponse]


# ==================== Trade History Schemas ====================

class TradeHistoryResponse(BaseModel):
    """成交記錄響應"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    strategy_id: int
    order_id: int
    side: str
    price: float
    qty: float
    profit: float
    filled_at: dt.datetime


class TradeHistoriesResponse(BaseModel):
    """成交記錄列表響應"""
    items: List[TradeHistoryResponse]


# ==================== Strategy Stats ====================

class StrategyStats(BaseModel):
    """策略績效統計"""
    total_profit: float
    total_profit_percent: float
    total_trades: int
    win_trades: int
    lose_trades: int
    win_rate: float
    avg_profit_per_trade: float
    max_profit: float
    max_loss: float
