import os

from sqlalchemy import create_engine, inspect, text
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


_MIGRATIONS: dict[str, list[str]] = {
    # (column) added to the schools table after initial creation
    "billing_status": "varchar(24)",
    "plan_updated_at": "timestamp with time zone",
}


def _migrate_columns(engine) -> None:
    """Idempotently add columns introduced after the table was first created.

    SQLAlchemy's create_all() only creates missing *tables*; it never adds new
    columns to tables that already exist. Existing production databases (e.g.
    the Neon Postgres) therefore need lightweight ALTERs. The plain (non
    'if not exists') form works on both Postgres and SQLite.
    """
    insp = inspect(engine)
    if "schools" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("schools")}
    with engine.begin() as conn:
        for col, ddl_type in _MIGRATIONS.items():
            if col not in existing:
                conn.execute(text(f'ALTER TABLE schools ADD COLUMN {col} {ddl_type}'))


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_columns(engine)
