import asyncio
import os
from typing import Any, Dict, Optional

from backend.config import SIMULATE_ORDERS
from backend.services.bot_manager import bot


class OrderExecutor:
    """Coordinate order placement via Playwright bot or simulated mode."""

    def __init__(self) -> None:
        self.simulate = SIMULATE_ORDERS
        self.lock = asyncio.Lock()

    async def _ensure_bot(self) -> Any:
        """Make sure the shared bot is started before placing real orders."""
        if self.simulate:
            return None
        if not bot.is_running:
            await bot.start()
        return bot

    async def place_order(self, symbol: str, side: str, price: Optional[float], qty: float, order_type: str = "MARKET") -> Dict[str, Any]:
        """Place order and return a normalized result dict."""
        if self.simulate:
            # Simulate delay and success; avoids touching real exchange in dev
            await asyncio.sleep(0.5)
            return {
                "status": "SIMULATED",
                "symbol": symbol,
                "side": side,
                "price": price,
                "qty": qty,
                "type": order_type,
                "exchange_order_id": f"SIM-{os.urandom(3).hex()}",
                "message": "Simulation mode is active; no real order sent.",
            }

        async with self.lock:
            live_bot = await self._ensure_bot()
            assert live_bot  # for type checker

            # Require login before placing an order to avoid silent failures
            if not await live_bot.check_login():
                raise RuntimeError("Bot is not logged in. Please log in via /api/bot/login first.")

            result = await live_bot.place_order(side=side, amount=qty, order_type=order_type, price=price)
            return {
                "status": result.get("status", "UNKNOWN"),
                "symbol": symbol,
                "side": side,
                "price": price,
                "qty": qty,
                "type": order_type,
                "exchange_order_id": result.get("exchange_order_id"),
                "message": result.get("message", ""),
            }


order_executor = OrderExecutor()
