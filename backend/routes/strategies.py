from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from typing import List, Optional
import datetime

from backend.database import get_session
from backend.models import Strategy, Order, TradeHistory
from backend.schemas import (
    StrategyCreate,
    StrategyUpdate,
    StrategyResponse,
    StrategiesResponse,
    TradeHistoriesResponse,
    StrategyStats,
)
from backend.services.grid_strategy_executor import grid_executor

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("", response_model=StrategiesResponse)
def get_strategies(
    status: Optional[str] = None,
    db: Session = Depends(get_session),
) -> StrategiesResponse:
    """
    取得策略列表，可選擇依狀態過濾。
    """
    query = db.query(Strategy)
    if status:
        query = query.filter(Strategy.status == status.upper())
    strategies = query.order_by(Strategy.created_at.desc()).all()
    return {"items": strategies}


@router.post("", response_model=StrategyResponse)
def create_strategy(
    strategy: StrategyCreate,
    db: Session = Depends(get_session),
) -> Strategy:
    """
    建立新的網格策略。
    """
    # 價格區間檢查
    if strategy.upper_price <= strategy.lower_price:
        raise HTTPException(
            status_code=400,
            detail="上限價格必須大於下限價格。",
        )

    # 檢查單格價格間距，避免過小
    grid_step = (strategy.upper_price - strategy.lower_price) / strategy.grid_count
    if grid_step < 1:
        raise HTTPException(
            status_code=400,
            detail=(
                f"單格價格間距過小（{grid_step:.2f}），"
                "請調整價格區間或網格數量。"
            ),
        )

    db_strategy = Strategy(
        name=strategy.name,
        symbol=strategy.symbol,
        type="GRID",
        status="CREATED",
        upper_price=strategy.upper_price,
        lower_price=strategy.lower_price,
        grid_count=strategy.grid_count,
        investment_per_grid=strategy.investment_per_grid,
        stop_loss=strategy.stop_loss,
        take_profit=strategy.take_profit,
        max_orders=strategy.max_orders,
    )

    db.add(db_strategy)
    db.commit()
    db.refresh(db_strategy)

    return db_strategy


@router.get("/{strategy_id}", response_model=StrategyResponse)
def get_strategy(strategy_id: int, db: Session = Depends(get_session)) -> Strategy:
    """
    取得單一策略。
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="找不到此策略。")
    return strategy


@router.put("/{strategy_id}", response_model=StrategyResponse)
def update_strategy(
    strategy_id: int,
    update: StrategyUpdate,
    db: Session = Depends(get_session),
) -> Strategy:
    """
    更新策略參數（僅允許在 CREATED / PAUSED 狀態下修改）。
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="找不到此策略。")

    if strategy.status not in ["CREATED", "PAUSED"]:
        raise HTTPException(
            status_code=400,
            detail=f"目前狀態為 {strategy.status}，無法修改策略。",
        )

    update_data = update.dict(exclude_unset=True)

    # 若有調整價格上下限，需先檢查區間合理性
    upper = update_data.get("upper_price", strategy.upper_price)
    lower = update_data.get("lower_price", strategy.lower_price)
    if upper <= lower:
        raise HTTPException(
            status_code=400,
            detail="上限價格必須大於下限價格。",
        )

    for key, value in update_data.items():
        setattr(strategy, key, value)

    db.commit()
    db.refresh(strategy)

    return strategy


@router.delete("/{strategy_id}")
def delete_strategy(strategy_id: int, db: Session = Depends(get_session)):
    """
    刪除策略（僅允許 CREATED / STOPPED 狀態）。
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="找不到此策略。")

    if strategy.status not in ["CREATED", "STOPPED"]:
        raise HTTPException(
            status_code=400,
            detail=f"目前狀態為 {strategy.status}，請先停止策略再刪除。",
        )

    # 先刪除關聯成交紀錄與訂單，再刪策略本身
    db.query(TradeHistory).filter(TradeHistory.strategy_id == strategy_id).delete()
    db.query(Order).filter(Order.strategy_id == strategy_id).delete()
    db.delete(strategy)
    db.commit()

    return {"message": "策略已刪除", "id": strategy_id}


@router.post("/{strategy_id}/start")
async def start_strategy(
    strategy_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
):
    """
    啟動策略（CREATED / PAUSED → RUNNING）。
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="找不到此策略。")

    if strategy.status not in ["CREATED", "PAUSED"]:
        raise HTTPException(
            status_code=400,
            detail=f"目前狀態為 {strategy.status}，無法啟動。",
        )

    strategy.status = "RUNNING"
    strategy.started_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(strategy)

    async def execute_strategy():
        result = await grid_executor.start_strategy(strategy_id)
        if not result.get("success"):
            print(f"[GridExecutor] 啟動策略 {strategy_id} 失敗: {result.get('error')}")

    background_tasks.add_task(execute_strategy)

    return {
        "message": "策略已啟動，BOT 會開始建立掛單。",
        "status": strategy.status,
        "strategy_id": strategy_id,
    }


@router.post("/{strategy_id}/pause")
def pause_strategy(strategy_id: int, db: Session = Depends(get_session)):
    """
    暫停策略（RUNNING → PAUSED）。
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="找不到此策略。")

    if strategy.status != "RUNNING":
        raise HTTPException(
            status_code=400,
            detail=f"目前狀態為 {strategy.status}，無法暫停。",
        )

    strategy.status = "PAUSED"

    db.commit()
    db.refresh(strategy)

    return {"message": "策略已暫停", "status": strategy.status}


@router.post("/{strategy_id}/stop")
async def stop_strategy(strategy_id: int, db: Session = Depends(get_session)):
    """
    停止策略（RUNNING / PAUSED → STOPPED），並嘗試取消相關掛單。
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="找不到此策略。")

    if strategy.status not in ["RUNNING", "PAUSED"]:
        raise HTTPException(
            status_code=400,
            detail=f"目前狀態為 {strategy.status}，無法停止。",
        )

    # 先請執行器取消掛單，再更新策略狀態
    result = await grid_executor.stop_strategy(strategy_id)

    strategy.status = "STOPPED"
    strategy.stopped_at = datetime.datetime.utcnow()

    try:
        db.commit()
        db.refresh(strategy)
    except OperationalError as e:
        db.rollback()
        # SQLite 在多執行緒同時寫入時可能出現 "database is locked"
        if "database is locked" in str(e):
            raise HTTPException(
                status_code=503,
                detail="系統正在處理掛單，暫時無法停止策略，請數秒後再試一次。",
            )
        raise HTTPException(
            status_code=500,
            detail="停止策略時發生資料庫錯誤，請稍後再試。",
        )

    return {
        "message": "策略已停止",
        "status": strategy.status,
        "cancelled_orders": result.get("cancelled_orders", 0),
    }


@router.get("/{strategy_id}/orders", response_model=List[dict])
def get_strategy_orders(
    strategy_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_session),
):
    """
    取得策略相關訂單列表，可依訂單狀態過濾。
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="找不到此策略。")

    query = db.query(Order).filter(Order.strategy_id == strategy_id)
    if status:
        query = query.filter(Order.status == status.upper())

    orders = query.order_by(Order.created_at.desc()).all()

    return [
        {
            "id": o.id,
            "side": o.side,
            "price": o.price,
            "qty": o.qty,
            "status": o.status,
            "grid_level": o.grid_level,
            "created_at": o.created_at.isoformat(),
        }
        for o in orders
    ]


@router.get("/{strategy_id}/trades", response_model=TradeHistoriesResponse)
def get_strategy_trades(
    strategy_id: int,
    db: Session = Depends(get_session),
) -> TradeHistoriesResponse:
    """
    取得策略相關成交紀錄。
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="找不到此策略。")

    trades = (
        db.query(TradeHistory)
        .filter(TradeHistory.strategy_id == strategy_id)
        .order_by(TradeHistory.filled_at.desc())
        .all()
    )

    return {"items": trades}


@router.get("/{strategy_id}/stats", response_model=StrategyStats)
def get_strategy_stats(strategy_id: int, db: Session = Depends(get_session)) -> StrategyStats:
    """
    取得策略統計資料（報酬率、勝率、最大獲利／虧損等）。
    """
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="找不到此策略。")

    trades = db.query(TradeHistory).filter(TradeHistory.strategy_id == strategy_id).all()
    if not trades:
        return StrategyStats(
            total_profit=0,
            total_profit_percent=0,
            total_trades=0,
            win_trades=0,
            lose_trades=0,
            win_rate=0,
            avg_profit_per_trade=0,
            max_profit=0,
            max_loss=0,
        )

    profits = [t.profit for t in trades if t.profit != 0]
    win_trades = [p for p in profits if p > 0]
    lose_trades = [p for p in profits if p < 0]

    total_investment = strategy.investment_per_grid * strategy.grid_count

    return StrategyStats(
        total_profit=strategy.total_profit,
        total_profit_percent=(strategy.total_profit / total_investment * 100)
        if total_investment > 0
        else 0,
        total_trades=strategy.total_trades,
        win_trades=len(win_trades),
        lose_trades=len(lose_trades),
        win_rate=(len(win_trades) / len(profits) * 100) if profits else 0,
        avg_profit_per_trade=(sum(profits) / len(profits)) if profits else 0,
        max_profit=max(profits) if profits else 0,
        max_loss=min(profits) if profits else 0,
    )

