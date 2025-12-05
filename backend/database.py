from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 將 DB 移到 backend/data/propw.db，避免放在專案根目錄
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "propw.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

# For SQLite we allow cross-thread access and increase timeout so that
# concurrent writes (例如策略啟動與停止同時更新) 會等待一段時間，而不是立即拋出 "database is locked"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_session():
    """Dependency to provide DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

