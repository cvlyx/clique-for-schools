from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool
from sqlalchemy.orm import sessionmaker

from models import Base
from settings import Settings


settings = Settings()

if settings.database_url.startswith("sqlite"):
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        connect_args={"connect_timeout": 10},
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
