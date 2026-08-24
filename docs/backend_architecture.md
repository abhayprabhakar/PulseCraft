# Backend Architecture

The RAPTOR backend is built on **FastAPI**, prioritizing asynchronous execution, data validation via Pydantic, and high performance. The backend acts as the central processor for raw IoT telemetry and orchestrates the AI pipelines.

## 1. Directory Structure

```text
backend/app/
├── main.py         # Entry point, routing mounts, CORS, and schema migrations
├── database.py     # SQLAlchemy engine and session management
├── models.py       # SQLAlchemy ORM definitions
├── schemas.py      # Pydantic validation schemas
├── storage.py      # Binary blob and file handling logic
├── routers/        # API Endpoints
│   ├── auth.py
│   ├── bikes.py
│   ├── favorites.py
│   ├── files.py
│   ├── friends.py
│   └── rides.py
└── analytics/      # Telemetry processing
    ├── events.py   # Signal smoothing and event extraction
    ├── scoring.py  # Algorithms for risk and efficiency scoring
    └── ml_models.py# Placeholders for future Scikit-Learn integrations
```

## 2. Database Models (`models.py`)

The system relies on SQLite (default) or PostgreSQL. Key models include:

- **`User`**: Core identity table. Maps to `Friendship`, `FriendRequest`, `Bike`, and `Ride`.
- **`Ride`**: Represents a track session.
  - Due to the high-frequency nature of telemetry (e.g. 50Hz for 1 hour), inserting millions of individual rows per ride isn't scalable for an MVP.
  - **Solution**: Raw telemetry is stored as a compressed JSON array in the `telemetry_blob` column. `analysis_blob` caches the computationally heavy AI summaries.
- **`Bike` & `BikeDocument`**: One-to-one relationship handling bike meta and compliance paperwork.
- **`RideUploadSession` & `RideUploadChunk`**: State machines for handling large, multi-part BLE uploads from the mobile client to prevent OOM errors on large rides.
- **`UploadedFile`**: Stores images and PDFs securely directly in the database (`LargeBinary`) for portability in MVP, with support for migrating to S3/GCS.

## 3. Analytics Pipeline (`analytics/`)

When a user uploads a ride or requests analysis:
1. **Preprocessing**: The raw telemetry blob is parsed into a Pandas DataFrame. Missing values (e.g., GPS drops) are interpolated.
2. **Smoothing**: Kinematic smoothing (`apply_kinematic_smoothing`) filters out noise in accelerometer and gyro data using rolling averages.
3. **Segmentation**: The ride is chopped into distinct segments based on braking events, apexes (lowest speed), and throttle roll-on zones.
4. **Scoring**: For each segment, algorithms calculate:
   - Peak Deceleration (Braking confidence)
   - Throttle Delay (Time between apex and throttle application)
   - Throttle Jerk (Smoothness of throttle application)
5. **Time Deltas**: Segments are compared against the fastest segment to highlight where the rider lost time (`time_delta_vs_best_s`).

## 4. Time Series AI & LLM Integration

The true power of RAPTOR is the LLM-enhanced coaching.

### Rule-Engine Fallback
Before querying the LLM, the system generates a "deterministic" coaching draft based strictly on numeric thresholds (e.g., if `time_delta` > 1.5s and `peak_decel` > -0.8m/s², the issue is "Braking Late").

### LLM Enrichment
If an LLM provider is active (e.g. `gemini-default`), the backend constructs a highly specialized prompt.

1. **Context Construction**: Sends the deterministic scorecard, the top 6 worst segments, and issue distributions to the model.
2. **Constraint Enforcement**: Forces the LLM to reply via structured JSON to ensure UI compatibility. The prompt enforces strict character limits and tone guidelines (e.g. "Do not say 'as an AI'").
3. **Multi-Model Support**: Managed via `_load_llm_provider_registry()`. Currently supports Gemini via `genai` and OpenAI-compatible endpoints (like Groq or local Llama instances).

> [!TIP]
> **Extending Analytics**: To add a new metric (e.g., Trail Braking Ratio), calculate it in `analytics/events.py`, add it to the JSON context in `routers/rides.py`, and the LLM will automatically begin coaching on it.
