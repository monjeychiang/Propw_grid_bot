from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.bot_manager import bot

router = APIRouter(prefix="/bot", tags=["bot"])

@router.post("/start")
async def start_bot():
    """Start the Playwright browser instance."""
    if bot.is_running:
        return {"message": "Bot is already running", "status": "running"}
    await bot.start()
    return {"message": "Bot started successfully", "status": "running"}

@router.post("/stop")
async def stop_bot():
    """Stop the Playwright browser instance."""
    await bot.close()
    return {"message": "Bot stopped", "status": "stopped"}

@router.get("/status")
async def get_bot_status():
    """Get current bot status, login state, and price."""
    logged_in = await bot.check_login()
    price = await bot.get_current_price()
    return {
        "running": bot.is_running,
        "logged_in": logged_in,
        "current_price": price
    }

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/open-login")
async def open_login():
    """Start bot and open the login modal for manual entry."""
    result = await bot.goto_login_page()
    # Accept both SUCCESS and WARNING as successful API calls (user action needed)
    return result

@router.post("/login")
async def login(request: LoginRequest):
    # Auto-start bot if not running
    if not bot.is_running:
        print("Bot not running, starting it now...")
        await bot.start()
    
    result = await bot.login(request.email, request.password)
    if result["status"] == "SUCCESS":
        return result
    else:
        raise HTTPException(status_code=400, detail=result["message"])

# Export bot instance for use in order_executor
__all__ = ["router", "bot"]
