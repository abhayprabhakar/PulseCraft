from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, LargeBinary
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime

class Ride(Base):
    __tablename__ = "rides"

    id = Column(String, primary_key=True, index=True) # UUID from mobile
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)
    
    # Summary Stats
    max_speed = Column(Float, default=0.0)
    avg_speed = Column(Float, default=0.0)
    max_lean_left = Column(Float, default=0.0)
    max_lean_right = Column(Float, default=0.0)
    max_rpm = Column(Integer, default=0)
    total_distance_km = Column(Float, default=0.0)

    # Raw Data Storage (JSON for simplicity in MVP, normalized tables in future)
    # Storing the entire route data as a large JSON blob to avoid millons of rows insert overhead for MVP
    # Ideally, we would use TimescaleDB or a separate frames table. 
    # For MVP, a JSON blob or a separate file is faster to implement.
    # Let's use a separate table for frames but maybe batch insert them.
    # Actually, JSON column is easiest for "upload and dump" style.
    telemetry_blob = Column(JSON, nullable=True) 
    laps = Column(JSON, nullable=True)

    title = Column(String, default="Untitled Ride")
    notes = Column(String, nullable=True)

    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="rides")
    
    bike_id = Column(Integer, ForeignKey("bikes.id"), nullable=True)
    bike = relationship("Bike", back_populates="rides")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String, nullable=True)
    profile_picture_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    rides = relationship("Ride", back_populates="owner")
    favorites = relationship("Favorite", back_populates="owner")
    bikes = relationship("Bike", back_populates="owner")


class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    user_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="favorites")


class Bike(Base):
    __tablename__ = "bikes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True) # e.g. "Simba", "Track Bike"
    make = Column(String, nullable=True) # e.g. "KTM"
    model = Column(String, nullable=True) # e.g. "Duke 390"
    year = Column(Integer, nullable=True)
    color = Column(String, default="#dc0000") # Hex code for UI
    image_url = Column(String, nullable=True)
    is_default = Column(Integer, default=0) # 0 or 1 (boolean via int for SQLite compat if needed)
    
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="bikes")
    rides = relationship("Ride", back_populates="bike")
    documents = relationship(
        "BikeDocument",
        back_populates="bike",
        uselist=False,
        cascade="all, delete-orphan",
    )


class BikeDocument(Base):
    __tablename__ = "bike_documents"

    id = Column(Integer, primary_key=True, index=True)
    bike_id = Column(Integer, ForeignKey("bikes.id"), unique=True, index=True)

    registration_number = Column(String, nullable=True)
    chassis_number = Column(String, nullable=True)
    engine_number = Column(String, nullable=True)
    owner_name = Column(String, nullable=True)

    driving_license_number = Column(String, nullable=True)
    driving_license_expiry = Column(String, nullable=True)
    driving_license_pdf_url = Column(String, nullable=True)

    insurance_policy_number = Column(String, nullable=True)
    insurance_expiry = Column(String, nullable=True)
    insurance_pdf_url = Column(String, nullable=True)

    pollution_certificate_number = Column(String, nullable=True)
    pollution_expiry = Column(String, nullable=True)
    pollution_pdf_url = Column(String, nullable=True)

    registration_certificate_number = Column(String, nullable=True)
    registration_expiry = Column(String, nullable=True)
    registration_certificate_pdf_url = Column(String, nullable=True)

    notes = Column(String, nullable=True)

    bike = relationship("Bike", back_populates="documents")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False, default="application/octet-stream")
    byte_size = Column(Integer, nullable=False, default=0)
    content = Column(LargeBinary, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
