from backend.config import HEADLESS_BROWSER
from backend.services.propw_bot import PropwBot

# Shared PropwBot instance for both API routes and order executor
bot = PropwBot(headless=HEADLESS_BROWSER)

__all__ = ["bot"]
