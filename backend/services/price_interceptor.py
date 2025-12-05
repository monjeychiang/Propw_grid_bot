"""
WebSocket 價格攔截器
持續從 Propw WebSocket 獲取最新價格並推送到成交判定器
"""
import asyncio
import json
import time
from typing import Callable, Optional

class PriceInterceptor:
    """攔截 WebSocket 價格數據"""
    
    def __init__(self):
        self.current_price: Optional[float] = None
        self.last_update_time: Optional[float] = None
        self.listeners = []  # 價格更新監聽器
        self.ws_url = "wss://ws.futurescw.com/market"
        
    def add_listener(self, callback: Callable[[float], None]):
        """添加價格更新監聽器"""
        self.listeners.append(callback)
    
    def _notify_listeners(self, price: float):
        """通知所有監聽器"""
        for callback in self.listeners:
            try:
                callback(price)
            except Exception as e:
                print(f"Error in price listener: {e}")
    
    def handle_websocket_message(self, message: str):
        """
        處理 WebSocket 消息
        
        從 propw_bot.py 的 WebSocket 監聽器調用
        """
        try:
            data = json.loads(message)
            
            # 檢查是否為價格數據
            if (data.get('biz') == 'futures' and 
                data.get('pairCode') == 'btc' and 
                isinstance(data.get('data'), dict) and 
                'p' in data['data']):
                
                # 提取價格
                price = float(data['data']['p'])
                
                # 更新當前價格
                self.current_price = price
                self.last_update_time = time.time()
                
                # 通知所有監聽器
                self._notify_listeners(price)
                
        except Exception as e:
            print(f"Error handling WebSocket message: {e}")
    
    def get_current_price(self) -> Optional[float]:
        """獲取當前價格"""
        return self.current_price
    
    def get_age(self) -> Optional[float]:
        """獲取價格數據的年齡（秒）"""
        if self.last_update_time:
            return time.time() - self.last_update_time
        return None

# 全局實例
price_interceptor = PriceInterceptor()
