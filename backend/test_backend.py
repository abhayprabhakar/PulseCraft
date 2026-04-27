import httpx

try:
    response = httpx.post(
        "http://localhost:8000/api/v1/rides/chat",
        json={
            "provider_id": "groq",
            "model_id": "llama-3.1-8b-instant",
            "messages": [{"role": "user", "content": "Hello"}]
        },
        timeout=10
    )
    print("Status:", response.status_code)
    print("Text:", response.text)
except Exception as e:
    print("Exception:", str(e))
