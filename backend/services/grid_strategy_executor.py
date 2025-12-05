"""
網格策略執行引擎
負責網格計算、訂單生成、成交回調處理
"""
import asyncio
import datetime
from typing import List, Dict, Optional, Callable
from decimal import Decimal, ROUND_DOWN

from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import Strategy, Order, TradeHistory
from backend.services.bot_manager import bot
from backend.services.fill_checker import fill_checker
from backend.services.notifier import notifier
from backend.services.price_interceptor import price_interceptor


class GridStrategyExecutor:
    """網格策略執行器"""
    
    def __init__(self):
        self.active_strategies: Dict[int, dict] = {}  # {strategy_id: state}
    
    def calculate_grid_levels(
        self, 
        upper_price: float, 
        lower_price: float, 
        grid_count: int
    ) -> List[float]:
        """
        計算等差網格價格
        
        Args:
            upper_price: 價格上限
            lower_price: 價格下限
            grid_count: 網格數量
            
        Returns:
            網格價格列表（從低到高）
        """
        step = (upper_price - lower_price) / grid_count
        levels = []
        
        for i in range(grid_count + 1):
            price = lower_price + i * step
            # 保留整數（適用於 BTC/USDT）
            levels.append(round(price, 0))
        
        return levels
    
    def calculate_qty_per_grid(
        self,
        investment_per_grid: float,
        grid_price: float
    ) -> float:
        """
        計算每格下單數量
        
        Args:
            investment_per_grid: 每格投資額 (USDT)
            grid_price: 網格價格
            
        Returns:
            下單數量 (USDT) - Propw 使用 USDT 單位下單
        """
        # Propw 使用 USDT 數量下單，直接返回投資額
        return investment_per_grid
    
    async def start_strategy(self, strategy_id: int) -> dict:
        """
        啟動策略 - 生成初始掛單
        
        Args:
            strategy_id: 策略 ID
            
        Returns:
            執行結果
        """
        db = SessionLocal()
        try:
            strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
            if not strategy:
                return {"success": False, "error": "策略不存在"}
            
            if strategy.status != "RUNNING":
                return {"success": False, "error": f"策略狀態為 {strategy.status}，無法執行"}
            
            # 計算網格
            levels = self.calculate_grid_levels(
                strategy.upper_price,
                strategy.lower_price,
                strategy.grid_count
            )
            
            # 獲取當前價格（從 price_interceptor 獲取，與前端共用同一來源）
            current_price = price_interceptor.get_current_price()
            price_age = price_interceptor.get_age()
            
            if not current_price or (price_age and price_age > 30):
                # 價格不可用或過舊（超過30秒），使用中間價
                current_price = (strategy.upper_price + strategy.lower_price) / 2
                print(f"⚠️ 無法獲取即時價格，使用中間價: {current_price}")
                print(f"   提示: 請先登入 Propw 以獲取即時價格")
            else:
                print(f"✅ 即時價格: {current_price} (更新於 {price_age:.1f}秒前)")
            
            print(f"\n📊 策略 [{strategy.name}] 開始執行")
            print(f"   價格範圍: {strategy.lower_price} - {strategy.upper_price}")
            print(f"   網格數: {strategy.grid_count}")
            print(f"   每格投資: {strategy.investment_per_grid} USDT")
            print(f"   當前價格: {current_price}")
            print(f"   網格層級: {levels}")
            print(f"")
            
            orders_created = []
            
            for i, level in enumerate(levels):
                # 跳過最接近當前價格的層級（避免立即成交）
                if abs(level - current_price) < (levels[1] - levels[0]) * 0.3:
                    print(f"   ⏩ 跳過層級 {i} (價格 {level}，太接近當前價)")
                    continue
                
                # 計算下單數量
                qty = self.calculate_qty_per_grid(strategy.investment_per_grid, level)
                
                if level < current_price:
                    # 低於現價 → 掛買單
                    side = "BUY"
                else:
                    # 高於現價 → 掛賣單
                    side = "SELL"
                
                # 創建訂單記錄
                order = Order(
                    strategy_id=strategy.id,
                    symbol=strategy.symbol,
                    side=side,
                    price=level,
                    qty=qty,
                    order_type="LIMIT",
                    status="PENDING",
                    grid_level=i,
                    is_entry=True
                )
                db.add(order)
                db.flush()  # 獲取 order.id
                
                # 顯示訂單資訊
                side_emoji = "🟢" if side == "BUY" else "🔴"
                print(f"   {side_emoji} 層級 {i}: {side} @ {level:.0f} | 數量: {qty} USDT")
                
                # 執行下單（如果 bot 正在運行）
                if bot.is_running:
                    try:
                        result = await bot.place_order(
                            side=side,
                            amount=qty,
                            order_type="LIMIT",
                            price=level
                        )
                        order.exchange_order_id = result.get("exchange_order_id")
                        print(f"      ✅ 下單成功")
                    except Exception as e:
                        print(f"      ❌ 下單失敗: {e}")
                        order.status = "FAILED"
                        order.error_message = str(e)
                
                # 註冊成交監控
                if order.status == "PENDING":
                    self._register_fill_monitor(order, strategy)
                
                orders_created.append({
                    "level": i,
                    "side": side,
                    "price": level,
                    "qty": qty
                })
                
                # 每筆訂單立即 commit 並通知前端（實時更新）
                db.commit()
                
                # 廣播單筆訂單創建通知
                await notifier.broadcast({
                    "type": "order_created",
                    "data": {
                        "strategy_id": strategy_id,
                        "order_id": order.id,
                        "side": side,
                        "price": level,
                        "qty": qty,
                        "status": order.status
                    }
                })
            
            # 記錄活躍策略
            self.active_strategies[strategy_id] = {
                "levels": levels,
                "current_price": current_price
            }
            
            # 廣播策略完成通知
            await notifier.broadcast({
                "type": "strategy_started",
                "data": {
                    "strategy_id": strategy_id,
                    "orders_count": len(orders_created)
                }
            })
            
            return {
                "success": True,
                "orders_created": len(orders_created),
                "levels": levels
            }
            
        except Exception as e:
            db.rollback()
            print(f"❌ 策略執行錯誤: {e}")
            return {"success": False, "error": str(e)}
        finally:
            db.close()
    
    def _register_fill_monitor(self, order: Order, strategy: Strategy):
        """註冊訂單成交監控"""
        order_id = f"{order.side}_{order.price}_{order.id}"
        
        def on_filled(oid: str, result: dict):
            """成交回調"""
            asyncio.create_task(self._on_order_filled(order.id, strategy.id, result))
        
        fill_checker.start_monitoring(
            order_id=order_id,
            side=order.side,
            order_price=order.price,
            callback=on_filled
        )
    
    async def _on_order_filled(self, order_id: int, strategy_id: int, fill_result: dict):
        """
        訂單成交回調 - 自動補單
        
        Args:
            order_id: 訂單 ID
            strategy_id: 策略 ID
            fill_result: 成交結果
        """
        db = SessionLocal()
        try:
            order = db.query(Order).filter(Order.id == order_id).first()
            strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
            
            if not order or not strategy:
                return
            
            if strategy.status != "RUNNING":
                print(f"⚠️ 策略 {strategy_id} 已停止，不再補單")
                return
            
            # 更新訂單狀態
            order.status = "FILLED"
            
            # 計算網格間距
            levels = self.calculate_grid_levels(
                strategy.upper_price,
                strategy.lower_price,
                strategy.grid_count
            )
            grid_step = levels[1] - levels[0] if len(levels) > 1 else 0
            
            # 創建成交記錄
            profit = 0.0
            if order.side == "SELL" and order.paired_order_id:
                # 賣單成交 → 計算利潤
                buy_order = db.query(Order).filter(Order.id == order.paired_order_id).first()
                if buy_order:
                    profit = (order.price - buy_order.price) * order.qty
                    strategy.total_profit += profit
            
            trade = TradeHistory(
                strategy_id=strategy_id,
                order_id=order_id,
                side=order.side,
                price=fill_result.get("current_price", order.price),
                qty=order.qty,
                profit=profit
            )
            db.add(trade)
            strategy.total_trades += 1
            
            # 自動補單
            if order.side == "BUY":
                # 買單成交 → 掛賣單
                new_price = order.price + grid_step
                if new_price <= strategy.upper_price:
                    new_order = Order(
                        strategy_id=strategy_id,
                        symbol=strategy.symbol,
                        side="SELL",
                        price=new_price,
                        qty=order.qty,
                        order_type="LIMIT",
                        status="PENDING",
                        grid_level=order.grid_level + 1 if order.grid_level else None,
                        is_entry=False,
                        paired_order_id=order.id
                    )
                    db.add(new_order)
                    db.flush()
                    
                    print(f"🔁 補單: SELL @ {new_price}")
                    
                    # 執行下單
                    if bot.is_running:
                        try:
                            await bot.place_order("SELL", order.qty, "LIMIT", new_price)
                        except Exception as e:
                            print(f"❌ 補單失敗: {e}")
                    
                    # 註冊監控
                    self._register_fill_monitor(new_order, strategy)
            
            else:
                # 賣單成交 → 掛買單
                new_price = order.price - grid_step
                if new_price >= strategy.lower_price:
                    new_order = Order(
                        strategy_id=strategy_id,
                        symbol=strategy.symbol,
                        side="BUY",
                        price=new_price,
                        qty=self.calculate_qty_per_grid(strategy.investment_per_grid, new_price),
                        order_type="LIMIT",
                        status="PENDING",
                        grid_level=order.grid_level - 1 if order.grid_level else None,
                        is_entry=True
                    )
                    db.add(new_order)
                    db.flush()
                    
                    print(f"🔁 補單: BUY @ {new_price}")
                    
                    if bot.is_running:
                        try:
                            await bot.place_order("BUY", new_order.qty, "LIMIT", new_price)
                        except Exception as e:
                            print(f"❌ 補單失敗: {e}")
                    
                    self._register_fill_monitor(new_order, strategy)
            
            db.commit()
            
            # 廣播成交通知
            await notifier.broadcast({
                "type": "order_filled",
                "data": {
                    "strategy_id": strategy_id,
                    "order_id": order_id,
                    "side": order.side,
                    "price": fill_result.get("current_price", order.price),
                    "profit": profit
                }
            })
            
        except Exception as e:
            db.rollback()
            print(f"❌ 成交回調處理錯誤: {e}")
        finally:
            db.close()
    
    async def stop_strategy(self, strategy_id: int) -> dict:
        """
        停止策略 - 取消所有掛單
        
        Args:
            strategy_id: 策略 ID
            
        Returns:
            執行結果
        """
        db = SessionLocal()
        try:
            # 取消所有待成交訂單
            pending_orders = db.query(Order).filter(
                Order.strategy_id == strategy_id,
                Order.status == "PENDING"
            ).all()
            
            cancelled_count = 0
            for order in pending_orders:
                # 停止成交監控
                order_monitor_id = f"{order.side}_{order.price}_{order.id}"
                fill_checker.stop_monitoring(order_monitor_id)
                
                # 更新狀態
                order.status = "CANCELLED"
                cancelled_count += 1
            
            # 移除活躍策略
            if strategy_id in self.active_strategies:
                del self.active_strategies[strategy_id]
            
            db.commit()
            
            return {
                "success": True,
                "cancelled_orders": cancelled_count
            }
            
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}
        finally:
            db.close()
    
    def get_strategy_status(self, strategy_id: int) -> Optional[dict]:
        """獲取策略實時狀態"""
        return self.active_strategies.get(strategy_id)


# 全局實例
grid_executor = GridStrategyExecutor()
