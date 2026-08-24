import sqlite3

db_path = "rides.db"

def add_bike_id_column():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Adding bike_id to rides table...")
        # Add column as nullable integer first
        cursor.execute("ALTER TABLE rides ADD COLUMN bike_id INTEGER")
        print("Success.")
    except sqlite3.OperationalError as e:
        print(f"Error adding bike_id: {e}")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    add_bike_id_column()
