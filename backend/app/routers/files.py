from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import database, models

router = APIRouter(
    prefix="/api/v1/files",
    tags=["files"],
)


@router.get("/{file_id}")
def get_uploaded_file(file_id: str, db: Session = Depends(database.get_db)):
    stored = db.query(models.UploadedFile).filter(models.UploadedFile.id == file_id).first()
    if not stored:
        raise HTTPException(status_code=404, detail="File not found")

    safe_filename = stored.filename or f"file-{file_id}"
    quoted_filename = quote(safe_filename)

    return Response(
        content=stored.content,
        media_type=stored.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quoted_filename}",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )
