FROM python:3.9-slim

WORKDIR /app

# Install system dependencies for build (some python packages need gcc)
RUN apt-get update && apt-get install -y gcc

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p uploads

# Expose port 8008
EXPOSE 8008

# Run uvicorn server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8008"]
