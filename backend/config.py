import os

# Database URL; default to local SQLite at backend/data/propw.db
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///backend/data/propw.db")

# Toggle live order execution; default simulate to avoid unintended trades
SIMULATE_ORDERS = os.getenv("SIMULATE_ORDERS", "true").lower() == "true"

# Toggle headless browser for Playwright when SIMULATE_ORDERS is false
HEADLESS_BROWSER = os.getenv("HEADLESS_BROWSER", "false").lower() == "true"
