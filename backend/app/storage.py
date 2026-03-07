import os
import uuid
from typing import Optional

from fastapi import UploadFile
from sqlalchemy.orm import Session

from . import models


def get_uploads_dir() -> str:
    configured_dir = os.getenv("UPLOADS_DIR")
    candidate_dirs = []

    if configured_dir:
        candidate_dirs.append(configured_dir)

    candidate_dirs.extend(["uploads", "/tmp/uploads"])

    for candidate in candidate_dirs:
        try:
            os.makedirs(candidate, exist_ok=True)
            if os.access(candidate, os.W_OK):
                return candidate
        except OSError:
            continue

    fallback = "/tmp/uploads"
    os.makedirs(fallback, exist_ok=True)
    return fallback


def save_upload_to_db(
    db: Session,
    upload_file: UploadFile,
    owner_id: Optional[int] = None,
) -> str:
    max_size = int(os.getenv("MAX_DB_FILE_SIZE_BYTES", "10485760"))
    payload = upload_file.file.read()
    payload = payload or b""

    if len(payload) > max_size:
        raise ValueError(f"File too large for DB storage (limit: {max_size} bytes)")

    safe_name = upload_file.filename or f"file-{uuid.uuid4().hex}"
    content_type = upload_file.content_type or "application/octet-stream"

    stored = models.UploadedFile(
        id=str(uuid.uuid4()),
        filename=safe_name,
        content_type=content_type,
        byte_size=len(payload),
        content=payload,
        owner_id=owner_id,
    )
    db.add(stored)
    db.commit()

    return f"/api/v1/files/{stored.id}"
