from dotenv import load_dotenv
load_dotenv() # Load env vars immediately

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import engine, Base
from .routers import rides, auth, favorites, bikes

# Create DB tables
Base.metadata.create_all(bind=engine)

def _ensure_ride_schema_columns() -> None:
    with engine.begin() as conn:
        try:
            result = conn.execute(text("PRAGMA table_info(rides)"))
            ride_columns = {row[1] for row in result.fetchall()}
        except Exception:
            ride_columns = set()

        if 'laps' not in ride_columns:
            conn.execute(text("ALTER TABLE rides ADD COLUMN laps JSON"))

_ensure_ride_schema_columns()

app = FastAPI(
    title="Raptor Analytics API",
    description="Backend for MotoGP-style racing telemetry analysis",
    version="1.0.0"
)

# CORS (Allow both localhost and production domain)
origins = [
    "http://localhost",
    "http://localhost:3000",
    "https://raptor.abhayprabhakar.dev",
    "http://raptor.abhayprabhakar.dev",
    "*" # Keep wildcard for mobile app development if needed, or restrict later
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
import os

# Ensure uploads directory exists
os.makedirs("uploads", exist_ok=True)

# Mount the uploads directory to be served at /uploads
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth.router)
app.include_router(rides.router)
app.include_router(favorites.router)
app.include_router(bikes.router)

@app.get("/")
def read_root():
    return {"status": "online", "service": "Raptor Analytics"}
