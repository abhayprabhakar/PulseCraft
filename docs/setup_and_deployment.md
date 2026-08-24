# Setup and Deployment Guide

Follow these instructions to get the RAPTOR platform running locally for development.

## 1. Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Python 3.9+** (for the FastAPI backend)
- **Node.js 18+** and **npm** (for the Vite/React frontend)
- **Git**

## 2. Backend Setup

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment (optional but highly recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install the Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure Environment Variables:
   Create a `.env` file in the `backend/` directory and add the necessary keys. To enable the AI Time Series Chat, you need an API key:
   ```env
   GEMINI_API_KEY=your_google_gemini_api_key
   # GROQ_API_KEY=your_groq_api_key (Optional alternative)
   ```

5. Start the backend server:
   ```bash
   uvicorn app.main:app --reload
   ```
   *Alternatively, on Windows, you can double click `start_backend.bat`.*

   **The API should now be running at [http://localhost:8000](http://localhost:8000).**
   You can view the interactive Swagger API documentation at [http://localhost:8000/docs](http://localhost:8000/docs).

## 3. Frontend Setup

1. Open a new terminal window and navigate to the frontend directory:
   ```bash
   cd raptor-frontend
   ```

2. Install the Node dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables (Optional):
   By default, the frontend connects to `http://localhost:8000`. If your backend is running elsewhere, create a `.env` file in `raptor-frontend/` and add:
   ```env
   VITE_API_URL=http://your-backend-ip:8000
   ```

4. Start the frontend development server:
   ```bash
   npm run dev
   ```

   **The web application should now be accessible at [http://localhost:5173](http://localhost:5173).**

## 4. Production Deployment

When preparing for production:

- **Database**: The local setup uses SQLite. For production, migrate to PostgreSQL by updating the `DATABASE_URL` in `database.py`.
- **Backend (Docker/Gunicorn)**: Use Gunicorn with Uvicorn workers for the FastAPI app. A basic `docker-compose.yml` is provided in the project root to containerize the API.
- **Frontend (Vercel/Netlify)**: Run `npm run build` in the `raptor-frontend` directory. Deploy the resulting `dist/` folder to a static hosting provider (e.g. Vercel, using the provided `vercel.json` config).
