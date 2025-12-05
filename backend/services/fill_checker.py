"""
訂單成交判定器
接受外部價格源，判定訂單是否成交
"""
import time
from typing import Callable, Optional, Dict

class OrderFillChecker:
    """訂單成交檢測器（接受外部價格源）"""
    
    def __init__(self, confirm_seconds: int = 3):
        self.confirm_seconds = confirm_seconds
        self.current_price: Optional[float] = None
        self.last_update_time: Optional[float] = None
        self.pending_checks: Dict[str, dict] = {}  # {order_id: check_state}
    
    def update_price(self, price: float):
        """
        從外部更新價格（由 WebSocket 攔截器調用）
        
        Args:
            price: 最新價格
        """
        self.current_price = price
        self.last_update_time = time.time()
        
        # 檢查所有待檢測的訂單
        self._check_all_pending_orders()
    
    def start_monitoring(self, order_id: str, side: str, order_price: float, 
                        callback: Optional[Callable] = None):
        """
        開始監控訂單成交
        
        Args:
            order_id: 訂單ID
            side: 'BUY' 或 'SELL'
            order_price: 掛單價格
            callback: 成交回調函數 callback(order_id, result)
        """
        self.pending_checks[order_id] = {
            'side': side.upper(),
            'order_price': order_price,
            'condition_met_start': None,
            'callback': callback,
            'created_at': time.time()
        }
        
        print(f"✅ 開始監控訂單 {order_id}: {side} @ {order_price}")
        print(f"   需持續滿足條件 {self.confirm_seconds} 秒")
    
    def _check_all_pending_orders(self):
        """檢查所有待檢測的訂單"""
        if self.current_price is None:
            return
        
        current_time = time.time()
        filled_orders = []
        
        for order_id, state in self.pending_checks.items():
            side = state['side']
            order_price = state['order_price']
            
            # 檢查價格是否滿足條件
            if side == 'BUY':
                condition_met = self.current_price <= order_price
            else:
                condition_met = self.current_price >= order_price
            
            if condition_met:
                # 首次滿足條件
                if state['condition_met_start'] is None:
                    state['condition_met_start'] = current_time
                    print(f"✅ 訂單 {order_id}: 價格滿足條件")
                    print(f"   當前價 {self.current_price} {'<=' if side=='BUY' else '>='} 掛單價 {order_price}")
                
                # 檢查持續時間
                duration = current_time - state['condition_met_start']
                
                if duration >= self.confirm_seconds:
                    # 成交！
                    result = {
                        'order_id': order_id,
                        'filled': True,
                        'current_price': self.current_price,
                        'order_price': order_price,
                        'duration': duration,
                        'filled_at': current_time
                    }
                    
                    print(f"🎉 訂單 {order_id} 成交！")
                    print(f"   持續滿足條件 {duration:.1f} 秒")
                    
                    # 調用回調
                    if state['callback']:
                        try:
                            state['callback'](order_id, result)
                        except Exception as e:
                            print(f"Error in callback: {e}")
                    
                    filled_orders.append(order_id)
                elif int(duration) != int(duration - 0.1):  # 每秒打印一次
                    print(f"⏳ 訂單 {order_id}: 持續滿足 {duration:.1f}/{self.confirm_seconds} 秒")
            
            else:
                # 條件不滿足，重置
                if state['condition_met_start'] is not None:
                    print(f"❌ 訂單 {order_id}: 價格不再滿足條件，重置計時")
                    print(f"   當前價 {self.current_price} {'>' if side=='BUY' else '<'} 掛單價 {order_price}")
                    state['condition_met_start'] = None
        
        # 移除已成交的訂單
        for order_id in filled_orders:
            del self.pending_checks[order_id]
    
    def stop_monitoring(self, order_id: str):
        """停止監控訂單"""
        if order_id in self.pending_checks:
            del self.pending_checks[order_id]
            print(f"⏹️ 停止監控訂單 {order_id}")
    
    def get_monitoring_orders(self):
        """獲取正在監控的訂單列表"""
        return list(self.pending_checks.keys())

# 全局實例
fill_checker = OrderFillChecker(confirm_seconds=3)
