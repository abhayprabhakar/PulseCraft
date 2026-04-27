import httpx

url = "https://api.groq.com/openai/v1/chat/completions"
headers = {"Authorization": "Bearer invalid_key", "Content-Type": "application/json"}
body = {
    "model": "llama-3.1-8b-instant",
    "messages": [{"role": "user", "content": "Hello"}]
}

try:
    response = httpx.post(url, headers=headers, json=body, timeout=10)
    print("Status:", response.status_code)
    print("Text:", response.text)
except Exception as e:
    print("Exception:", str(e))
