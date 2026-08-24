import sqlite3

db_path = "rides.db"

def add_columns():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Adding profile_picture_url to users table...")
        cursor.execute("ALTER TABLE users ADD COLUMN profile_picture_url VARCHAR")
        print("Success.")
    except sqlite3.OperationalError as e:
        print(f"Skipping users: {e}")

    try:
        print("Adding image_url to bikes table...")
        cursor.execute("ALTER TABLE bikes ADD COLUMN image_url VARCHAR")
        print("Success.")
    except sqlite3.OperationalError as e:
        print(f"Skipping bikes: {e}")

    try:
        print("Adding laps to rides table...")
        cursor.execute("ALTER TABLE rides ADD COLUMN laps JSON")
        print("Success.")
    except sqlite3.OperationalError as e:
        print(f"Skipping rides laps: {e}")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    add_columns()
