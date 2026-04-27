from dotenv import load_dotenv
load_dotenv() # Load env vars immediately

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import engine, Base
from .routers import rides, auth, favorites, bikes, files as files_router, friends
from .storage import get_uploads_dir

# Create DB tables
Base.metadata.create_all(bind=engine)

from sqlalchemy import inspect
import re
def _ensure_ride_schema_columns() -> None:
    try:
        inspector = inspect(engine)
        if not inspector.has_table("rides"):
            return # Let Base.metadata.create_all handle new tables

        columns = [col['name'] for col in inspector.get_columns("rides")]
        if 'laps' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE rides ADD COLUMN laps JSON"))
        if 'visibility' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE rides ADD COLUMN visibility VARCHAR DEFAULT 'private'"))
        if 'analysis_blob' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE rides ADD COLUMN analysis_blob JSON"))
        if 'analysis_updated_at' not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE rides ADD COLUMN analysis_updated_at DATETIME"))

        with engine.begin() as conn:
            conn.execute(text("UPDATE rides SET visibility = 'private' WHERE visibility IS NULL OR visibility = ''"))
    except Exception as e:
        print(f"Schema check failed gracefully: {e}")

_ensure_ride_schema_columns()


def _normalize_username_seed(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_.]", "", (value or "").strip().lower())
    cleaned = cleaned.strip("._")
    return cleaned or "rider"


def _ensure_user_schema_columns() -> None:
    try:
        inspector = inspect(engine)
        if not inspector.has_table("users"):
            return

        columns = {col['name'] for col in inspector.get_columns("users")}
        ts_type = "TIMESTAMP" if engine.dialect.name.startswith("postgres") else "DATETIME"

        alter_statements = {
            'username': "ALTER TABLE users ADD COLUMN username VARCHAR",
            'phone_number': "ALTER TABLE users ADD COLUMN phone_number VARCHAR",
            'last_known_lat': "ALTER TABLE users ADD COLUMN last_known_lat FLOAT",
            'last_known_lng': "ALTER TABLE users ADD COLUMN last_known_lng FLOAT",
            'last_location_label': "ALTER TABLE users ADD COLUMN last_location_label VARCHAR",
            'last_location_updated_at': f"ALTER TABLE users ADD COLUMN last_location_updated_at {ts_type}",
        }

        # Apply one statement at a time so a single column failure does not block others.
        for col_name, statement in alter_statements.items():
            if col_name in columns:
                continue
            try:
                with engine.begin() as conn:
                    conn.execute(text(statement))
                columns.add(col_name)
            except Exception as col_exc:
                print(f"User schema migration skipped for '{col_name}': {col_exc}")

        # Backfill usernames only when the column is available.
        if 'username' not in columns:
            return

        with engine.begin() as conn:
            users = conn.execute(text("SELECT id, email, full_name, username FROM users ORDER BY id ASC")).fetchall()
            used_usernames = set()

            for row in users:
                user_id = row[0]
                email = row[1] or ""
                full_name = row[2] or ""
                username = (row[3] or "").strip().lower()

                if username and username not in used_usernames:
                    used_usernames.add(username)
                    continue

                seed = _normalize_username_seed(full_name.replace(" ", "_"))
                if seed == "rider":
                    email_local = email.split("@", 1)[0] if "@" in email else email
                    seed = _normalize_username_seed(email_local)

                candidate = seed
                suffix = 1
                while candidate in used_usernames:
                    candidate = f"{seed}{suffix}"
                    suffix += 1

                used_usernames.add(candidate)
                conn.execute(
                    text("UPDATE users SET username = :username WHERE id = :user_id"),
                    {"username": candidate, "user_id": user_id},
                )
    except Exception as e:
        print(f"User schema check failed gracefully: {e}")


_ensure_user_schema_columns()

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

uploads_dir = get_uploads_dir()

# Mount the uploads directory to be served at /uploads
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

app.include_router(auth.router)
app.include_router(rides.router)
app.include_router(favorites.router)
app.include_router(bikes.router)
app.include_router(files_router.router)
app.include_router(friends.router)

@app.get("/")
def read_root():
    return {"status": "online", "service": "Raptor Analytics"}
