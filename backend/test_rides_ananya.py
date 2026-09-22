import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token
import time

client = TestClient(app)
token = create_access_token({"sub": "ananyaakkihal18@gmail.com"})
headers = {"Authorization": f"Bearer {token}"}

t0 = time.time()
response = client.get("/api/v1/rides", headers=headers)
print(f"Status: {response.status_code}, Time: {time.time()-t0:.2f}s")
if response.status_code == 200:
    print(f"Count: {len(response.json())}")
else:
    print(response.text)
