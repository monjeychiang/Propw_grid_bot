from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_session

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=schemas.OrdersResponse)
async def list_orders(
    status: Optional[str] = Query(None, description="Filter by status"),
    symbol: Optional[str] = Query(None, description="Filter by symbol"),
    strategy_id: Optional[int] = Query(None, description="Filter by strategy"),
    db: Session = Depends(get_session),
):
    """列出所有訂單"""
    query = db.query(models.Order)
    if status:
        query = query.filter(models.Order.status == status)
    if symbol:
        query = query.filter(models.Order.symbol == symbol)
    if strategy_id:
        query = query.filter(models.Order.strategy_id == strategy_id)
    query = query.order_by(models.Order.created_at.desc())
    items: List[models.Order] = query.all()
    return {"items": items}
