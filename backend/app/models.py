from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, LargeBinary, UniqueConstraint
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
    visibility = Column(String, nullable=False, default="private", index=True)

    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="rides")
    
    bike_id = Column(Integer, ForeignKey("bikes.id"), nullable=True)
    bike = relationship("Bike", back_populates="rides")
    share_links = relationship(
        "RideShareLink",
        back_populates="ride",
        cascade="all, delete-orphan",
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True, nullable=True)
    phone_number = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String)
    full_name = Column(String, nullable=True)
    profile_picture_url = Column(String, nullable=True)
    last_known_lat = Column(Float, nullable=True)
    last_known_lng = Column(Float, nullable=True)
    last_location_label = Column(String, nullable=True)
    last_location_updated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    rides = relationship("Ride", back_populates="owner")
    favorites = relationship("Favorite", back_populates="owner")
    bikes = relationship("Bike", back_populates="owner")
    sent_friend_requests = relationship(
        "FriendRequest",
        back_populates="requester",
        foreign_keys="FriendRequest.requester_id",
        cascade="all, delete-orphan",
    )
    received_friend_requests = relationship(
        "FriendRequest",
        back_populates="receiver",
        foreign_keys="FriendRequest.receiver_id",
        cascade="all, delete-orphan",
    )
    friends = relationship(
        "Friendship",
        back_populates="user",
        foreign_keys="Friendship.user_id",
        cascade="all, delete-orphan",
    )
    shared_ride_links = relationship(
        "RideShareLink",
        back_populates="created_by",
        foreign_keys="RideShareLink.created_by_id",
    )


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


class RideUploadSession(Base):
    __tablename__ = "ride_upload_sessions"

    id = Column(String, primary_key=True, index=True)
    ride_id = Column(String, nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    total_chunks = Column(Integer, nullable=False)
    uploaded_chunks = Column(Integer, nullable=False, default=0)
    content_encoding = Column(String, nullable=False, default="gzip")
    content_type = Column(String, nullable=False, default="application/json")
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    chunks = relationship(
        "RideUploadChunk",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class RideUploadChunk(Base):
    __tablename__ = "ride_upload_chunks"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("ride_upload_sessions.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    byte_size = Column(Integer, nullable=False, default=0)
    content = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    session = relationship("RideUploadSession", back_populates="chunks")

    __table_args__ = (
        UniqueConstraint("session_id", "chunk_index", name="uq_ride_upload_chunk_session_index"),
    )


class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id = Column(Integer, primary_key=True, index=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="pending", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    responded_at = Column(DateTime, nullable=True)

    requester = relationship("User", back_populates="sent_friend_requests", foreign_keys=[requester_id])
    receiver = relationship("User", back_populates="received_friend_requests", foreign_keys=[receiver_id])

    __table_args__ = (
        UniqueConstraint("requester_id", "receiver_id", name="uq_friend_request_pair"),
    )


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    friend_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="friends", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("user_id", "friend_id", name="uq_friendship_pair"),
    )


class RideShareLink(Base):
    __tablename__ = "ride_share_links"

    id = Column(Integer, primary_key=True, index=True)
    ride_id = Column(String, ForeignKey("rides.id"), nullable=False, index=True)
    token = Column(String, nullable=False, unique=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    last_accessed_at = Column(DateTime, nullable=True)

    ride = relationship("Ride", back_populates="share_links")
    created_by = relationship("User", back_populates="shared_ride_links", foreign_keys=[created_by_id])
