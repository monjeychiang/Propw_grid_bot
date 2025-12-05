from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import sys
import asyncio

# Fix for Playwright on Windows (NotImplementedError in create_subprocess_exec)
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from backend.database import Base, engine
from backend.routes import orders, bot, strategies
from backend.services.notifier import notifier

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Propw Trading Bot API",
    description="Grid Strategy Trading System with automated order management",
    version="2.2.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lifecycle Events
@app.on_event("startup")
async def startup_event():
    print("✅ Server starting...")
    print("📊 Database initialized")
    print("📈 Grid Strategy API enabled")
    print("🌐 API docs available at http://localhost:8000/docs")

@app.on_event("shutdown")
async def shutdown_event():
    print("🛑 Server shutting down...")
    # Close bot if running
    if bot.bot.is_running:
        await bot.bot.close()

# Register API Routes
app.include_router(orders.router, prefix="/api")
app.include_router(bot.router, prefix="/api")
app.include_router(strategies.router, prefix="/api")

# WebSocket Route
@app.websocket("/ws")
async def websocket_general(websocket: WebSocket):
    """General WebSocket for real-time updates (orders, strategies, prices)"""
    await notifier.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        notifier.disconnect(websocket)

# Health Check
@app.get("/")
async def root():
    return {
        "name": "Propw Trading Bot API",
        "version": "2.2.0",
        "status": "running"
    }


# Custom Log Config to include timestamps
LOG_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "()": "uvicorn.logging.DefaultFormatter",
            "fmt": "%(asctime)s - %(levelprefix)s %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
            "use_colors": None,
        },
        "access": {
            "()": "uvicorn.logging.AccessFormatter",
            "fmt": '%(asctime)s - %(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    },
    "handlers": {
        "default": {
            "formatter": "default",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stderr",
        },
        "access": {
            "formatter": "access",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
        },
    },
    "loggers": {
        "uvicorn": {"handlers": ["default"], "level": "INFO"},
        "uvicorn.error": {"level": "INFO"},
        "uvicorn.access": {"handlers": ["access"], "level": "INFO", "propagate": False},
    },
}

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True, log_config=LOG_CONFIG)
