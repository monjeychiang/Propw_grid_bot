from fastapi import WebSocket
from typing import List, Any
import json

class Notifier:
    """WebSocket 通知服務"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"WebSocket client connected. Total: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"WebSocket client disconnected. Total: {len(self.active_connections)}")
    
    async def broadcast(self, message: Any):
        """廣播消息給所有連接的客戶端"""
        if not self.active_connections:
            return
            
        # 如果是字典，轉換為 JSON
        if isinstance(message, dict):
            text = json.dumps(message)
        else:
            text = str(message)
            
        # 廣播
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(text)
            except Exception as e:
                print(f"Error sending to client: {e}")
                disconnected.append(connection)
        
        # 清理斷開的連接
        for conn in disconnected:
            self.disconnect(conn)

# 全局實例
notifier = Notifier()
