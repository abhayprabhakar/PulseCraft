import sys
import os
import time
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token

client = TestClient(app)

token = create_access_token({"sub": "ananyaakkihal18@gmail.com"})
headers = {"Authorization": f"Bearer {token}"}

response = client.get("/api/v1/rides/1774460202959_ananya", headers=headers)
print("Detail Status:", response.status_code)
if response.status_code != 200:
    print(response.json())

response = client.get("/api/v1/rides/1774460202959_ananya/analysis", headers=headers)
print("Analysis Status:", response.status_code)
if response.status_code != 200:
    print(response.json())
