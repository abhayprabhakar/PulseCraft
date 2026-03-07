from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from .. import models, schemas, auth, database

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["auth"]
)

@router.post("/register", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
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
    
    db.commit()
    db.refresh(current_user)
    return current_user

from fastapi import UploadFile, File
import shutil
import os
import uuid

@router.post("/users/me/avatar", response_model=schemas.User)
def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Generate unique filename
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = f"uploads/{unique_filename}"
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Update user profile
    # URL will be relative, triggering static mount
    image_url = f"/uploads/{unique_filename}"
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

    return {
        "total_rides": total_rides,
        "total_distance_km": round(total_distance, 2),
        "max_speed_kph": round(max_speed_all_time, 1),
        "total_hours": round(total_duration_seconds / 3600, 1),
        "favorite_bike": favorite_bike_name
    }
