import sys
import os
import time
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from app.auth import create_access_token

client = TestClient(app)

token = create_access_token({"sub": "ananyaakkihal18@gmail.com"})
headers = {"Authorization": f"Bearer {token}"}

start = time.time()
response = client.get("/api/v1/rides/1774460202959_ananya", headers=headers)
end = time.time()
print(f"getDetail time: {end - start:.2f} seconds")

start = time.time()
response = client.get("/api/v1/rides/1774460202959_ananya/analysis", headers=headers)
end = time.time()
print(f"getAnalysis time: {end - start:.2f} seconds")
