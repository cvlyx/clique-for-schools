import os

from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool
from sqlalchemy.orm import sessionmaker

from models import Base
from settings import Settings


settings = Settings()

# On Vercel serverless the filesystem is read-only except /tmp, and /tmp is
# ephemeral. A Postgres DATABASE_URL is the durable production option; a bare
# sqlite URL here is only useful for a throwaway demo (data is lost on cold
# start).
database_url = settings.database_url
if settings.database_url.startswith("sqlite") and os.environ.get("VERCEL"):
    database_url = "sqlite:////tmp/clique.db"

if database_url.startswith("sqlite"):
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        database_url,
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
