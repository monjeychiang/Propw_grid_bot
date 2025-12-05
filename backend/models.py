from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from backend.database import Base
import datetime


class Strategy(Base):
    """網格策略模型"""
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    symbol = Column(String(20), default="BTCUSDT", index=True)
    type = Column(String(20), default="GRID")  # GRID, MARTINGALE, DCA
    status = Column(String(20), default="CREATED", index=True)  # CREATED, RUNNING, PAUSED, STOPPED
    
    # 網格參數
    upper_price = Column(Float, nullable=False)
    lower_price = Column(Float, nullable=False)
    grid_count = Column(Integer, nullable=False)
    investment_per_grid = Column(Float, nullable=False)
    
    # 風控參數
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)
    max_orders = Column(Integer, default=50)
    
    # 統計數據
    total_profit = Column(Float, default=0.0)
    total_trades = Column(Integer, default=0)
    
    # 時間戳
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    stopped_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # 關聯
    orders = relationship("Order", back_populates="strategy")
    trades = relationship("TradeHistory", back_populates="strategy")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(Integer, ForeignKey("strategies.id"), nullable=True, index=True)  # 關聯策略
    symbol = Column(String, index=True)
    side = Column(String)
    price = Column(Float, nullable=True)
    qty = Column(Float)
    order_type = Column(String) # MARKET / LIMIT
    status = Column(String, default="SUBMITTING", index=True) # SUBMITTING, PENDING, FILLED, CANCELLED, FAILED
    exchange_order_id = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    
    # 網格策略專用欄位
    grid_level = Column(Integer, nullable=True)  # 網格層級
    paired_order_id = Column(Integer, nullable=True)  # 配對訂單 ID
    is_entry = Column(Boolean, default=True)  # 是否為入場單
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    strategy = relationship("Strategy", back_populates="orders")


class TradeHistory(Base):
    """成交記錄（用於盈虧計算）"""
    __tablename__ = "trade_history"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(Integer, ForeignKey("strategies.id"), index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True)
    
    side = Column(String(10))  # BUY / SELL
    price = Column(Float)
    qty = Column(Float)
    profit = Column(Float, default=0.0)  # 本次盈虧（賣單才有）
    
    filled_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    strategy = relationship("Strategy", back_populates="trades")
