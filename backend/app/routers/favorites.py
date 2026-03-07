from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/v1/favorites",
    tags=["favorites"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=schemas.Favorite)
def create_favorite(
    favorite: schemas.FavoriteCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_fav = models.Favorite(
        name=favorite.name,
        lat=favorite.lat,
        lng=favorite.lng,
        user_id=current_user.id
    )
    db.add(db_fav)
    db.commit()
    db.refresh(db_fav)
    return db_fav

@router.get("/", response_model=List[schemas.Favorite])
def read_favorites(
    skip: int = 0, 
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return db.query(models.Favorite).filter(models.Favorite.user_id == current_user.id).offset(skip).limit(limit).all()

@router.delete("/{favorite_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_favorite(
    favorite_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_fav = db.query(models.Favorite).filter(
        models.Favorite.id == favorite_id,
        models.Favorite.user_id == current_user.id
    ).first()
    
    if not db_fav:
        raise HTTPException(status_code=404, detail="Favorite not found")
    
    db.delete(db_fav)
    db.commit()
    return None
