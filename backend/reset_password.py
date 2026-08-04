import sys
import os

# Add current directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash

def list_users():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        if not users:
            print("No users found in database.")
            return []
        print("\nExisting Users in Database:")
        print("-" * 50)
        for u in users:
            print(f"ID: {u.id} | Email: {u.email} | Username: {u.username or 'N/A'} | Full Name: {u.full_name or 'N/A'}")
        print("-" * 50)
        return users
    finally:
        db.close()

def reset_password(identifier, new_password):
    db = SessionLocal()
    try:
        user = db.query(User).filter(
            (User.email == identifier) | (User.username == identifier)
        ).first()
        
        if not user:
            print(f"Error: User with email/username '{identifier}' not found.")
            return False

        user.hashed_password = get_password_hash(new_password)
        db.commit()
        print(f"Successfully updated password for user '{user.email}' (Username: '{user.username}').")
        return True
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  List users:               python reset_password.py list")
        print("  Reset password:           python reset_password.py <email_or_username> <new_password>")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "list":
        list_users()
    elif len(sys.argv) >= 3:
        identifier = sys.argv[1]
        new_password = sys.argv[2]
        reset_password(identifier, new_password)
    else:
        print("Please provide a new password. Usage: python reset_password.py <email_or_username> <new_password>")
