from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os


def _resolve_sqlite_db_path() -> str:
    # Explicit override always wins
    db_path_override = os.getenv("DB_PATH")
    if db_path_override:
        return db_path_override

    # Container volume path (local/docker)
    if os.path.exists("/app/data"):
        return "/app/data/rides.db"

    # Vercel serverless runtime has read-only /var/task, writable /tmp
    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV"):
        return "/tmp/rides.db"

    # Local default
    default_path = "./rides.db"
    default_dir = os.path.dirname(os.path.abspath(default_path)) or "."
    if os.access(default_dir, os.W_OK):
        return default_path

    # Generic serverless/read-only fallback
    return "/tmp/rides.db"

database_url = os.getenv("DATABASE_URL") or os.getenv("SQLALCHEMY_DATABASE_URL")

if database_url:
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URL = database_url
else:
    db_file_path = _resolve_sqlite_db_path()

    db_dir = os.path.dirname(os.path.abspath(db_file_path))
    if db_dir and not os.path.exists(db_dir):
        try:
            os.makedirs(db_dir, exist_ok=True)
        except Exception:
            pass

    SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_file_path}"

engine_kwargs = {"pool_pre_ping": True}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
