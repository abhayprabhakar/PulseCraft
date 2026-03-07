from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from .. import database, models, schemas, auth
from ..storage import save_upload_to_db
import os
import uuid

router = APIRouter(
    prefix="/api/v1/bikes",
    tags=["bikes"]
)

@router.get("/", response_model=List[schemas.Bike])
def list_bikes(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.Bike).filter(models.Bike.owner_id == current_user.id).all()

@router.post("/", response_model=schemas.Bike, status_code=status.HTTP_201_CREATED)
def create_bike(bike_data: schemas.BikeCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    new_bike = models.Bike(
        **bike_data.dict(),
        owner_id=current_user.id
    )
    db.add(new_bike)
    db.commit()
    db.refresh(new_bike)
    
    # Handle is_default logic: if new bike is default, unset others
    if new_bike.is_default:
        db.query(models.Bike).filter(
            models.Bike.owner_id == current_user.id,
            models.Bike.id != new_bike.id
        ).update({"is_default": 0})
        db.commit()
        
    return new_bike

@router.put("/{bike_id}", response_model=schemas.Bike)
def update_bike(bike_id: int, bike_update: schemas.BikeUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    bike = db.query(models.Bike).filter(models.Bike.id == bike_id, models.Bike.owner_id == current_user.id).first()
    if not bike:
        raise HTTPException(status_code=404, detail="Bike not found")
    
    update_data = bike_update.dict(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(bike, key, value)
        
    db.commit()
    db.refresh(bike)
    
    if bike.is_default:
         db.query(models.Bike).filter(
            models.Bike.owner_id == current_user.id,
            models.Bike.id != bike.id
        ).update({"is_default": 0})
         db.commit()

    return bike

@router.delete("/{bike_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bike(bike_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    bike = db.query(models.Bike).filter(models.Bike.id == bike_id, models.Bike.owner_id == current_user.id).first()
    if not bike:
        raise HTTPException(status_code=404, detail="Bike not found")
    
    # Check if bike has rides? Maybe set them to null?
    # For now, just delete and let rides have null bike_id (if not cascaded) OR prevent deletion.
    # Safe approach: Nullify rides first
    db.query(models.Ride).filter(models.Ride.bike_id == bike_id).update({"bike_id": None})
    
    db.delete(bike)
    db.commit()
    return None

@router.post("/{bike_id}/image", response_model=schemas.Bike)
def upload_bike_image(
    bike_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    bike = db.query(models.Bike).filter(models.Bike.id == bike_id, models.Bike.owner_id == current_user.id).first()
    if not bike:
        raise HTTPException(status_code=404, detail="Bike not found")

    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Update bike
    try:
        image_url = save_upload_to_db(db, file, owner_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    bike.image_url = image_url
    db.commit()
    db.refresh(bike)
    
    return bike


def _get_or_create_bike_document(db: Session, bike_id: int) -> models.BikeDocument:
    doc = db.query(models.BikeDocument).filter(models.BikeDocument.bike_id == bike_id).first()
    if doc:
        return doc

    doc = models.BikeDocument(bike_id=bike_id)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{bike_id}/documents", response_model=schemas.BikeDocument)
def get_bike_documents(
    bike_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    bike = db.query(models.Bike).filter(
        models.Bike.id == bike_id,
        models.Bike.owner_id == current_user.id,
    ).first()
    if not bike:
        raise HTTPException(status_code=404, detail="Bike not found")

    return _get_or_create_bike_document(db, bike_id)


@router.put("/{bike_id}/documents", response_model=schemas.BikeDocument)
def update_bike_documents(
    bike_id: int,
    payload: schemas.BikeDocumentUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    bike = db.query(models.Bike).filter(
        models.Bike.id == bike_id,
        models.Bike.owner_id == current_user.id,
    ).first()
    if not bike:
        raise HTTPException(status_code=404, detail="Bike not found")

    doc = _get_or_create_bike_document(db, bike_id)
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(doc, key, value)

    db.commit()
    db.refresh(doc)
    return doc


@router.post(
    "/{bike_id}/documents/{doc_type}/pdf",
    response_model=schemas.BikeDocumentUploadResponse,
)
def upload_bike_document_pdf(
    bike_id: int,
    doc_type: str,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    bike = db.query(models.Bike).filter(
        models.Bike.id == bike_id,
        models.Bike.owner_id == current_user.id,
    ).first()
    if not bike:
        raise HTTPException(status_code=404, detail="Bike not found")

    if file.content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(status_code=400, detail="File must be a PDF")

    allowed_doc_types = {
        "driving_license": "driving_license_pdf_url",
        "insurance": "insurance_pdf_url",
        "pollution": "pollution_pdf_url",
        "registration": "registration_certificate_pdf_url",
    }
    if doc_type not in allowed_doc_types:
        raise HTTPException(status_code=400, detail="Unsupported document type")

    ext = os.path.splitext(file.filename or "document.pdf")[1].lower()
    if ext != ".pdf":
        ext = ".pdf"

    upload_name = f"bike_{bike_id}_{doc_type}_{uuid.uuid4()}{ext}"
    file.filename = upload_name
    try:
        pdf_url = save_upload_to_db(db, file, owner_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    doc = _get_or_create_bike_document(db, bike_id)
    setattr(doc, allowed_doc_types[doc_type], pdf_url)
    db.commit()

    return schemas.BikeDocumentUploadResponse(doc_type=doc_type, pdf_url=pdf_url)
