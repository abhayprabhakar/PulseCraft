from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os

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

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
