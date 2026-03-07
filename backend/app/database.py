from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os

database_url = os.getenv("DATABASE_URL") or os.getenv("SQLALCHEMY_DATABASE_URL")

if database_url:
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URL = database_url
else:
    # Check if running in Docker (or if /app/data exists)
    # Default to local relative path
    db_file_path = "./rides.db"

    # If operating inside the container with volume mounted
    if os.path.exists("/app/data"):
        db_file_path = "/app/data/rides.db"

    # Allow override via ENV
    if os.getenv("DB_PATH"):
        db_file_path = os.getenv("DB_PATH")

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
