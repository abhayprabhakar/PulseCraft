import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Ride, User
from app.schemas import RideAnalysisResponse, RideDetail

DATABASE_URL = "postgresql://postgres.vjofrzrdwmchtcsxapno:7%3F%404G%2BM%25_qrDY-h@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

db = SessionLocal()

try:
    ride_id = '1774460202959_ananya'
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        print("Ride not found")
        sys.exit(1)
    
    print(f"Ride found: {ride.id}")
    
    # Simulate get_ride
    print("Testing get_ride (RideDetail validation)...")
    from app.routers.rides import _decorate_ride_response
    _decorate_ride_response(ride)
    
    try:
        detail = RideDetail.from_orm(ride)
        print("RideDetail validation successful!")
    except Exception as e:
        print(f"RideDetail validation failed: {e}")
        
    # Simulate get_ride_analysis
    print("Testing get_ride_analysis validation...")
    cached_blob = ride.analysis_blob
    try:
        analysis = RideAnalysisResponse(**cached_blob)
        print("RideAnalysisResponse validation successful!")
    except Exception as e:
        print(f"RideAnalysisResponse validation failed: {e}")

except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
