import sys
import os
import json
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app import database, models
from app.routers.rides import _extract_share_map_points

db = database.SessionLocal()
try:
    rides = db.query(models.Ride).all()
    print(f"Found {len(rides)} rides to backfill.")
    updated = 0
    for ride in rides:
        if ride.map_preview_blob is None and ride.telemetry_blob is not None:
            points = _extract_share_map_points(ride.telemetry_blob, max_points=140)
            ride.map_preview_blob = points
            updated += 1
            if updated % 10 == 0:
                print(f"Backfilled {updated} rides...")
                db.commit()
    db.commit()
    print(f"Successfully backfilled {updated} rides.")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
