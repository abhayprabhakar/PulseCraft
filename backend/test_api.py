import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from app.auth import create_access_token
import json

client = TestClient(app)

token = create_access_token({"sub": "ananyaakkihal18@gmail.com"})
headers = {"Authorization": f"Bearer {token}"}

print("Testing /api/v1/rides/1774460202959_ananya ...")
response = client.get("/api/v1/rides/1774460202959_ananya", headers=headers)
if response.status_code == 200:
    data = response.json()
    print("telemetry_blob type:", type(data.get("telemetry_blob")))
    if isinstance(data.get("telemetry_blob"), list):
        print("telemetry_blob length:", len(data.get("telemetry_blob")))
else:
    print(response.text)

print("\nTesting /api/v1/rides/1774460202959_ananya/analysis ...")
response = client.get("/api/v1/rides/1774460202959_ananya/analysis", headers=headers)
if response.status_code == 200:
    data = response.json()
    print("map_segments type:", type(data.get("map_segments")))
    if isinstance(data.get("map_segments"), list):
        print("map_segments length:", len(data.get("map_segments")))
else:
    print(response.text)
