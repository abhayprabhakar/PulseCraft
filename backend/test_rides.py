import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token

client = TestClient(app)
token = create_access_token({"sub": "ananyaakkihal18@gmail.com"})
headers = {"Authorization": f"Bearer {token}"}

response = client.get("/api/v1/rides", headers=headers)
print("No bike_id Status:", response.status_code)
rides = response.json()
print(f"Rides count: {len(rides)}")

response = client.get("/api/v1/rides?bike_id=10", headers=headers)
print("With bike_id Status:", response.status_code)
rides_bike = response.json()
print(f"Rides bike count: {len(rides_bike)}")
