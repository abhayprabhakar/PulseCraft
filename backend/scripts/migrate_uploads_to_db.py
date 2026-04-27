import argparse
import mimetypes
import os
import sys
from pathlib import Path
from typing import Dict, Optional
from urllib.parse import urlparse

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import Base, SessionLocal, engine
from app import models


FILE_URL_PREFIX = "/api/v1/files/"


def _extract_upload_filename(url: Optional[str]) -> Optional[str]:
    if not url:
        return None

    if FILE_URL_PREFIX in url:
        return None

    parsed = urlparse(url)
    path = parsed.path or url
    marker = "/uploads/"
    if marker not in path:
        return None

    filename = path.split(marker, 1)[1].strip().split("/")[0]
    return filename or None


def _content_type_for(filename: str) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def _existing_file_url_by_filename(db_session, filename: str, byte_size: int):
    existing = (
        db_session.query(models.UploadedFile)
        .filter(models.UploadedFile.filename == filename, models.UploadedFile.byte_size == byte_size)
        .order_by(models.UploadedFile.created_at.desc())
        .first()
    )
    if not existing:
        return None
    return f"{FILE_URL_PREFIX}{existing.id}"


def main():
    parser = argparse.ArgumentParser(description="Migrate legacy /uploads files into DB-backed UploadedFile storage.")
    parser.add_argument("--source-dir", default="uploads", help="Directory containing legacy upload files.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without committing.")
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    if not source_dir.exists() or not source_dir.is_dir():
        print(f"Source directory not found: {source_dir}")
        return 1

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    created_files = 0
    reused_files = 0
    updated_fields = 0
    scanned = 0
    filename_to_new_url: Dict[str, str] = {}

    try:
        for file_path in sorted(source_dir.iterdir()):
            if not file_path.is_file():
                continue
            scanned += 1
            file_name = file_path.name
            payload = file_path.read_bytes()
            byte_size = len(payload)

            existing_url = _existing_file_url_by_filename(db, file_name, byte_size)
            if existing_url:
                filename_to_new_url[file_name] = existing_url
                reused_files += 1
                continue

            stored = models.UploadedFile(
                id=os.urandom(16).hex(),
                filename=file_name,
                content_type=_content_type_for(file_name),
                byte_size=byte_size,
                content=payload,
                owner_id=None,
            )
            db.add(stored)
            db.flush()

            new_url = f"{FILE_URL_PREFIX}{stored.id}"
            filename_to_new_url[file_name] = new_url
            created_files += 1

        users = db.query(models.User).all()
        for user in users:
            filename = _extract_upload_filename(user.profile_picture_url)
            if filename and filename in filename_to_new_url:
                next_url = filename_to_new_url[filename]
                if user.profile_picture_url != next_url:
                    user.profile_picture_url = next_url
                    updated_fields += 1

        bikes = db.query(models.Bike).all()
        for bike in bikes:
            filename = _extract_upload_filename(bike.image_url)
            if filename and filename in filename_to_new_url:
                next_url = filename_to_new_url[filename]
                if bike.image_url != next_url:
                    bike.image_url = next_url
                    updated_fields += 1

        docs = db.query(models.BikeDocument).all()
        url_fields = [
            "driving_license_pdf_url",
            "insurance_pdf_url",
            "pollution_pdf_url",
            "registration_certificate_pdf_url",
        ]

        for doc in docs:
            for field_name in url_fields:
                current_url = getattr(doc, field_name)
                filename = _extract_upload_filename(current_url)
                if filename and filename in filename_to_new_url:
                    next_url = filename_to_new_url[filename]
                    if current_url != next_url:
                        setattr(doc, field_name, next_url)
                        updated_fields += 1

        if args.dry_run:
            db.rollback()
            print("DRY RUN complete. No changes committed.")
        else:
            db.commit()
            print("Migration committed.")

        print(
            f"Scanned files: {scanned} | Newly stored: {created_files} | Reused existing DB files: {reused_files} | URL fields updated: {updated_fields}"
        )
        return 0

    except Exception as exc:
        db.rollback()
        print(f"Migration failed: {exc}")
        return 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
