# RAPTOR Developer Guide

Welcome to the RAPTOR (Rider Analytics Platform for Track Optimization) developer documentation. This guide provides a comprehensive overview of the system architecture, features, backend, frontend, and setup instructions. It is designed to get new developers up to speed for production-ready development.

---

## 1. System Architecture

RAPTOR is built on a modern, decoupled architecture designed for high throughput telemetry and AI-driven insights:
- **Hardware/IoT Layer**: ESP32 microcontroller with sensors (IMU, GPS) transmitting telemetry via Bluetooth (BLE).
- **Backend**: Python FastAPI providing RESTful APIs, SQLite (or PostgreSQL) database via SQLAlchemy, and AI integrations for time-series analysis.
- **Frontend**: React Single Page Application (SPA) built with Vite, TypeScript, Recharts, and React Router.

---

## 2. Features Breakdown

### 2.1 Core Telemetry & Ride Logging
- Records granular ride data including timestamp, speed, RPM, throttle percent, acceleration, gyroscope, lean angle, and GPS coordinates.
- Supports scalable chunked uploading for large telemetry payloads (`RideUploadSession`, `RideUploadChunk` tables).

### 2.2 AI Insights & Chatbot (Time Series AI)
- Intelligent AI-driven analysis of ride telemetry using an LLM integration layer (supporting Google Gemini and Groq).
- The `TimeSeriesChatPage` allows riders to contextually ask questions about specific rides.
- Backend parses time-series telemetry and dynamically uses the configured `llm_provider` and `llm_model` to generate professional track insights.

### 2.3 User Management & Auth
- Secure JWT-based authentication.
- User profiles with avatars and location tracking (`last_known_lat`, `last_known_lng`) to facilitate local rider discovery.

### 2.4 Bike Garage & Documents
- **Bike Management**: Users can manage multiple bikes with specific details (make, model, color, year).
- **Document Vault**: Securely stores structured metadata and PDFs for vehicle registration, driving licenses, insurance policies, and pollution certificates (`BikeDocument`).

### 2.5 Social & Sharing
- **Friends System**: Send, accept, and manage friend requests (`FriendRequest`, `Friendship`).
- **Share Links**: Generate secure, tokenized URLs to share specific rides with unauthenticated external users (with expiration capabilities via `RideShareLink`).

---

## 3. Backend Implementation (FastAPI)

Located in the `/backend` directory.

### 3.1 Core Stack
- **Framework**: FastAPI (High performance, async-ready)
- **Database ORM**: SQLAlchemy
- **Data Validation**: Pydantic
- **Migrations**: Custom startup schema checks (e.g., `_ensure_ride_schema_columns` in `main.py`).

### 3.2 Database Schema
Key models are defined in `backend/app/models.py`:
- `User`: Handles authentication and relationships to rides, bikes, and friends.
- `Ride`: Central entity storing ride summaries and raw data blobs (`telemetry_blob`, `laps`, `analysis_blob`). Uses JSONB for flexible telemetry storage.
- `Bike` & `BikeDocument`: Vehicle metadata and compliance tracking.
- `Friendship` & `FriendRequest`: Representing the social graph.
- `RideShareLink`: Access control for external ride sharing.

### 3.3 Folder Structure
```text
backend/app/
├── routers/        # API route handlers (auth, rides, bikes, friends, files)
├── analytics/      # Logic for parsing telemetry and ML insights
├── models.py       # SQLAlchemy database models
├── schemas.py      # Pydantic models for request/response validation
├── database.py     # Database connection setup
├── main.py         # Application entry point and CORS middleware
└── storage.py      # File upload and asset serving logic
```

---

## 4. Frontend Implementation (React / Vite)

Located in the `/raptor-frontend` directory.

### 4.1 Core Stack
- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Routing**: React Router DOM (`/rides/:id`, `/dashboard`, etc.)
- **Visualization**: Recharts (Graphs), Leaflet/`react-leaflet` (GPS Tracks), React Markdown.

### 4.2 Key Pages & Components
- **`App.tsx`**: Defines routing and layout hierarchy. Protected routes dynamically verify authentication state via context.
- **`DashboardPage.tsx`**: High-level overview of recent rides, active bikes, and quick statistics.
- **`RidePage.tsx`**: Detailed visualization of a specific ride, rendering interactive telemetry charts and map traces.
- **`TimeSeriesChatPage.tsx`**: Chat interface for querying the backend AI about track performance.
- **`BikeDocumentsPage.tsx`**: UI for managing vehicle compliance documents and PDFs.

### 4.3 State Management & API
- Authentication state is managed globally via `AuthContext`.
- API calls are modularized in the `/services` folder (e.g., `api.ts`), using `axios` with interceptors for seamless JWT token injection and refresh management.

---

## 5. Local Development Setup

### 5.1 Prerequisites
- Python 3.9+
- Node.js 18+
- SQLite (default configuration) or PostgreSQL

### 5.2 Running the Backend
1. Navigate to `/backend`.
2. Install dependencies: `pip install -r requirements.txt`
3. Set environment variables (create a `.env` file for `GEMINI_API_KEY`, `GROQ_API_KEY`, `JWT_SECRET`, etc.).
4. Start the server: `uvicorn app.main:app --reload` (or use `start_backend.bat` on Windows).
   *The API and Swagger docs will be available at http://localhost:8000/docs*

### 5.3 Running the Frontend
1. Navigate to `/raptor-frontend`.
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`
   *The application will be available at http://localhost:5173*

---

## 6. Extending the Platform

- **Adding new telemetry metrics**: Update parsing logic in `backend/app/analytics/` and expose the derived metric via `/api/v1/rides/{id}`. Update the frontend visualizations in `RidePage.tsx`.
- **New ML Models**: Integrate Python-based Scikit-Learn or PyTorch models in the backend analytics pipeline to augment the existing Gemini/Groq time-series analysis for advanced anomaly detection or clustering.
- **Mobile Expansion**: The backend CORS middleware currently supports broad access to facilitate future Flutter app integration.
