# RAPTOR / PulseCraft: Conceptual Knowledge Base

*This document is designed as a comprehensive conceptual overview of the RAPTOR (Rider Analytics Platform for Track Optimization) project, also known under the moniker PulseCraft. It is structured to provide an LLM or a new team member with complete contextual, architectural, and domain knowledge of the platform.*

---

## 1. Executive Summary

**RAPTOR** is a DIY smart-bike system and analytics platform that transforms conventional motorcycles into connected, insight-driven machines. Unlike expensive proprietary telemetry systems, RAPTOR uses low-cost external sensors and advanced software processing to provide professional-grade track and street analytics.

**The core value proposition:** "Crafting intelligence into your ride. Simple bike. Smart brain. Zero compromises."

The platform is designed to be **non-intrusive** and **read-only**. It never splices into the motorcycle's Electronic Control Unit (ECU), ensuring the bike remains fully operational and safe even if the telemetry system fails.

---

## 2. Core Philosophy & Constraints

- **Read-Only Telemetry:** The system only listens. It does not alter engine tuning, braking, or throttle maps.
- **Electrical Isolation:** The hardware stack is electrically isolated from the bike's critical systems (using optocouplers or inductive pickups).
- **Hybrid Intelligence:** The system combines deterministic, physics-based analytics (kinematic smoothing, deceleration physics) with Generative AI (LLMs like Google Gemini and Groq) to translate raw numbers into human-readable coaching.
- **Hardware Agnosticism:** While tested on a Bajaj Pulsar NS200 (BS4) with an ESP32, the backend expects a generic JSON payload of time-series data, making it adaptable to any data-logger.

---

## 3. High-Level System Architecture

The project is decoupled into three primary layers:

### A. Hardware / IoT Layer (The Edge)
- **Microcontroller:** ESP32 Dev Module (Dual-core, BLE/WiFi enabled).
- **Sensors:** MPU-6050 IMU (Lean angle, acceleration), NEO-6M GPS (Speed, location), voltage dividers (Battery health), inductive pickup (RPM).
- **Data Transmission:** Telemetry is gathered at high frequencies (e.g., 10-50Hz), batched, and transmitted via Bluetooth Low Energy (BLE) to a mobile device, which forwards it to the cloud.

### B. Backend Layer (The Brain)
- **Framework:** Python / FastAPI.
- **Data Storage:** SQLite (Dev) / PostgreSQL (Prod) via SQLAlchemy ORM.
- **Storage Strategy:** Structured relational data for users and metadata, but raw time-series telemetry is stored as compressed JSON blobs to handle millions of data points efficiently without heavy timeseries database overhead (in the MVP stage).
- **Analytics Engine:** Uses `pandas` and `numpy` to process telemetry arrays, apply smoothing, extract segments, and calculate deltas.
- **AI Integration:** Prompts LLMs with JSON scorecards to generate natural language coaching.

### C. Frontend Layer (The UI)
- **Framework:** React 18, Vite, TypeScript.
- **Visualization:** Recharts for telemetry graphs (Speed/RPM over time), React-Leaflet for GPS map traces.
- **Core Functionality:** Visualizing track segments, showing areas of time-loss (red/green segments on the map), interacting with the Time Series AI Chatbot, and managing digital vehicle documents (insurance, registration).

---

## 4. The Analytics & ML Pipeline (How it Works)

The most complex part of RAPTOR is the backend analytics pipeline (`analytics/events.py` and `scoring.py`). 

### Step 1: Preprocessing & Smoothing
Raw GPS and IMU data is noisy. The backend interpolates missing frames and applies **Kinematic Smoothing** (rolling averages and noise thresholds) to create a clean baseline of speed, acceleration (`accel_mps2`), and throttle.

### Step 2: Segmentation
A continuous ride is sliced into dynamic "segments". Segments are defined by cornering phases:
- **Entry:** Hard braking (peak deceleration).
- **Apex:** Lowest recorded speed in a curve.
- **Exit:** Throttle roll-on and positive acceleration.

### Step 3: Scoring & Time Deltas
Each segment is analyzed against deterministic rules:
- **Braking Distance / Peak Decel:** How late and hard did the rider brake?
- **Throttle Delay:** Milliseconds between the apex and hitting >15% throttle.
- **Throttle Jerk:** The standard deviation/rate of change of the throttle application.
The system calculates a `time_delta_vs_best_s` by comparing a specific segment against the fastest pass of that same segment type.

### Step 4: The Time Series AI (Coaching)
Because raw numbers (e.g., "Throttle Jerk: 4.2") are meaningless to novice riders, RAPTOR uses an LLM.
1. The backend compiles a deterministic scorecard (e.g., late upshift count, % of time in powerband, segment time loss).
2. This scorecard is injected into a strict, highly engineered prompt.
3. The LLM (Gemini 2.5 Flash / Groq LLaMA 3) returns a JSON payload containing specific `strengths`, `weaknesses`, and actionable `drills`.
4. The user reads natural language advice: *"You are waiting too long after the apex to apply throttle. Drill: Practice one smooth brake release followed by a single controlled throttle ramp."*

---

## 5. Domain Entities (Database Schema)

Understanding the data models provides a clear picture of the platform's capabilities:

- **`User`**: The rider. Tracks identity, authentication (JWT), and social metrics (`last_known_lat/lng` for local rider discovery).
- **`Bike`**: A rider can own multiple bikes (e.g., Track Bike, Commuter). Tracks make, model, color, and year.
- **`BikeDocument`**: A digital vault for the bike. Stores strings (license plate numbers) and URLs to PDFs (insurance, pollution certificates, registration).
- **`Ride`**: The core event. Contains aggregated stats (`max_speed`, `duration`) and the heavy `telemetry_blob` (the raw JSON array of sensor readings).
- **`RideUploadSession` & `RideUploadChunk`**: To handle massive data payloads from mobile networks, rides are uploaded in chunks and reassembled by the backend.
- **`Friendship` & `FriendRequest`**: Social graph elements allowing riders to connect, compare stats, and view each other's public rides.
- **`RideShareLink`**: Secure, expirable token links allowing unauthenticated users to view a specific ride's telemetry (e.g., sharing a lap with a suspension tuner).

---

## 6. Future Expansion & Roadmap

If tasked with extending RAPTOR, an LLM should consider these upcoming vectors:

1. **Machine Learning Clustering:** Implementing Scikit-Learn (K-Means/DBSCAN) over historical rider data to cluster riding styles (e.g., "Aggressive vs. Smooth") automatically.
2. **Gear Estimation Algorithm:** Deducing the current gear based on the ratio of Engine RPM to Vehicle Speed, filtering out clutch-slip noise.
3. **Suspension Telemetry:** Adding linear potentiometers to track fork travel and rebound rates.
4. **Real-Time Dashboards:** Transitioning from BLE post-ride uploads to real-time WebSockets/MQTT for live pit-wall telemetry broadcasting.

---
*End of Conceptual Documentation.*
