from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime, timedelta
import re
from .. import models, schemas, auth, database

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["auth"]
)


def _normalize_username(raw: str) -> str:
    candidate = re.sub(r"[^a-zA-Z0-9_.]", "", (raw or "").strip().lower())
    return candidate.strip("._")


def _derive_username_seed(email: str, full_name: str | None = None) -> str:
    if full_name:
        seed = _normalize_username(full_name.replace(" ", "_"))
        if len(seed) >= 3:
            return seed
    local = email.split("@", 1)[0] if email else ""
    seed = _normalize_username(local)
    return seed or "rider"


def _ensure_unique_username(db: Session, base: str) -> str:
    normalized_base = _normalize_username(base)
    if len(normalized_base) < 3:
        normalized_base = "rider"

    candidate = normalized_base
    suffix = 1
    while db.query(models.User).filter(models.User.username == candidate).first() is not None:
        candidate = f"{normalized_base}{suffix}"
        suffix += 1
    return candidate


@router.get("/username-availability", response_model=schemas.UsernameAvailability)
def check_username_availability(username: str, db: Session = Depends(database.get_db)):
    normalized_username = _normalize_username(username)
    if len(normalized_username) < 3:
        return {
            "username": username,
            "normalized_username": normalized_username,
            "available": False,
            "message": "Username must be at least 3 characters",
        }

    username_exists = db.query(models.User).filter(models.User.username == normalized_username).first()
    if username_exists:
        return {
            "username": username,
            "normalized_username": normalized_username,
            "available": False,
            "message": "Username already taken",
        }

    return {
        "username": username,
        "normalized_username": normalized_username,
        "available": True,
        "message": "Username is available",
    }

@router.post("/register", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    requested_username = _normalize_username(user.username or "")
    if requested_username and len(requested_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")

    if requested_username:
        username_exists = db.query(models.User).filter(models.User.username == requested_username).first()
        if username_exists:
            raise HTTPException(status_code=400, detail="Username already taken")
        resolved_username = requested_username
    else:
        resolved_username = _ensure_unique_username(
            db,
            _derive_username_seed(user.email, user.full_name),
        )

    normalized_phone = (user.phone_number or "").strip() or None
    if normalized_phone:
        phone_exists = db.query(models.User).filter(models.User.phone_number == normalized_phone).first()
        if phone_exists:
            raise HTTPException(status_code=400, detail="Phone number already in use")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(
        email=user.email,
        username=resolved_username,
        phone_number=normalized_phone,
        hashed_password=hashed_password,
        full_name=user.full_name
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    credential = (form_data.username or "").strip().lower()
    user = db.query(models.User).filter(
        or_(
            models.User.email == credential,
            models.User.username == credential,
        )
    ).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@router.put("/me", response_model=schemas.User)
def update_user_me(user_update: schemas.UserUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    if user_update.email is not None:
        # Check if email is taken
        existing = db.query(models.User).filter(models.User.email == user_update.email).first()
        if existing and existing.id != current_user.id:
             raise HTTPException(status_code=400, detail="Email already registered")
        current_user.email = user_update.email
    if user_update.username is not None:
        normalized_username = _normalize_username(user_update.username)
        if len(normalized_username) < 3:
            raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
        existing_username = db.query(models.User).filter(models.User.username == normalized_username).first()
        if existing_username and existing_username.id != current_user.id:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = normalized_username
    if user_update.phone_number is not None:
        normalized_phone = user_update.phone_number.strip() or None
        if normalized_phone:
            existing_phone = db.query(models.User).filter(models.User.phone_number == normalized_phone).first()
            if existing_phone and existing_phone.id != current_user.id:
                raise HTTPException(status_code=400, detail="Phone number already in use")
        current_user.phone_number = normalized_phone
    
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/location", response_model=schemas.User)
def update_my_location(
    payload: schemas.UserLocationUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if payload.lat < -90 or payload.lat > 90:
        raise HTTPException(status_code=400, detail="lat must be between -90 and 90")
    if payload.lng < -180 or payload.lng > 180:
        raise HTTPException(status_code=400, detail="lng must be between -180 and 180")

    current_user.last_known_lat = float(payload.lat)
    current_user.last_known_lng = float(payload.lng)
    current_user.last_location_label = (payload.label or "").strip() or None
    current_user.last_location_updated_at = datetime.utcnow()

    db.commit()
    db.refresh(current_user)
    return current_user

from fastapi import UploadFile, File
from ..storage import save_upload_to_db

@router.post("/users/me/avatar", response_model=schemas.User)
def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Update user profile
    try:
        image_url = save_upload_to_db(db, file, owner_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    current_user.profile_picture_url = image_url
    db.commit()
    db.refresh(current_user)
    
    return current_user

@router.get("/users/me/stats")
def get_user_stats(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    rides = db.query(models.Ride).filter(models.Ride.owner_id == current_user.id).all()
    
    total_rides = len(rides)
    total_distance = sum(r.total_distance_km for r in rides if r.total_distance_km)
    max_speed_all_time = max((r.max_speed for r in rides if r.max_speed), default=0.0)
    total_duration_seconds = sum(r.duration_seconds for r in rides if r.duration_seconds)
    
    # Calculate favorite bike
    bike_counts = {}
    favorite_bike_name = "None"
    if rides:
        for r in rides:
            if r.bike_id:
                bike_counts[r.bike_id] = bike_counts.get(r.bike_id, 0) + 1
        
        if bike_counts:
            fav_bike_id = max(bike_counts, key=bike_counts.get)
            fav_bike = db.query(models.Bike).filter(models.Bike.id == fav_bike_id).first()
            if fav_bike:
                favorite_bike_name = fav_bike.name

    following_count = (
        db.query(models.Friendship)
        .filter(models.Friendship.user_id == current_user.id)
        .count()
    )
    followers_count = (
        db.query(models.Friendship)
        .filter(models.Friendship.friend_id == current_user.id)
        .count()
    )

    return {
        "total_rides": total_rides,
        "total_distance_km": round(total_distance, 2),
        "max_speed_kph": round(max_speed_all_time, 1),
        "total_hours": round(total_duration_seconds / 3600, 1),
        "favorite_bike": favorite_bike_name,
        "following_count": following_count,
        "followers_count": followers_count,
    }
