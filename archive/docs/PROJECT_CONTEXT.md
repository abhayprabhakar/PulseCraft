# RAPTOR (Rider Analytics Platform for Track Optimization)
## Knowledge Transfer & Simulation Context

---

## 1. Project Overview

The Rider Analytics Platform for Track Optimization (RAPTOR) is an IoT- and machine-learning–based project aimed at providing affordable track-performance analytics for amateur motorcycle riders. The system collects riding dynamics data using onboard sensors and vehicle diagnostics, processes the data using analytical and ML techniques, and presents actionable insights through a web-based dashboard.

This document provides full context for simulation, data assumptions, and frontend/backend development, enabling effective AI-assisted (vibe coding) development.

---

## 2. System Architecture Overview

### Hardware Layer
- ESP32 (ESP32-WROOM-32)
- MPU-6050 IMU (lean angle, acceleration)
- NEO-6M GPS module (speed, lap timing)
- MicroSD card (local logging)
- Bluetooth OBD adapter (ELM327-compatible)

### Communication
- IMU → ESP32 via I²C
- GPS → ESP32 via UART
- SD card → ESP32 via SPI
- OBD data → ESP32 via Bluetooth Classic (SPP)
- ESP32 → Backend via Wi-Fi (post-ride upload)

---

## 3. Simulation Scope & Assumptions

### What is Simulated
- Sensor data (IMU, GPS, OBD) using synthetic or recorded datasets
- Riding sessions composed of multiple laps
- Performance metrics derived from sensor streams
- ML inference on riding behavior
- Visualization and analytics dashboard

### What is NOT Simulated
- Physical ESP32 hardware behavior
- Bluetooth protocol stack
- Real GPS satellite acquisition
- Real CAN/K-Line vehicle bus

Bluetooth-based OBD acquisition is treated as an electrically isolated black box.

---

## 4. Simulated Data Model

### Ride Hierarchy
```

Rider
└── Session
└── Lap
└── Timestamped Sensor Data

````

### Sensor Data Fields
```json
{
  "timestamp": "ms",
  "speed_kmph": float,
  "rpm": int,
  "throttle_percent": float,
  "accel_x": float,
  "accel_y": float,
  "accel_z": float,
  "gyro_x": float,
  "gyro_y": float,
  "gyro_z": float,
  "lean_angle": float,
  "latitude": float,
  "longitude": float
}
````

---

## 5. Performance Metrics (Phase 1)

### Control

* Throttle Smoothness Index (std dev of throttle)
* Braking Jerk (rate of change of deceleration)

### Stability

* Lean Angle Variance
* Lateral Acceleration RMS

### Efficiency

* Speed-to-Lean Ratio
* Speed Loss During Braking

### Consistency

* Lap Time Variance
* Lap Pattern Similarity

Metrics are computed per lap and aggregated per session.

---

## 6. Machine Learning Context

### ML Objectives

* Identify inefficient riding patterns
* Detect anomalies (unstable braking, erratic cornering)
* Cluster riding styles
* Track improvement trends

### ML Approach

* Unsupervised learning preferred
* K-Means / DBSCAN for clustering
* Isolation Forest for anomaly detection
* Regression for performance trend analysis

ML models operate on feature-engineered lap-level data.

---

## 7. Simulation Strategy

### Firmware Logic

* Simulated via dummy CSV/JSON inputs
* Represents ESP32 output logs

### Sensor Simulation

* Lean angle: sinusoidal patterns + noise
* Speed: correlated with lean and throttle
* Braking: sharp negative acceleration spikes
* GPS: interpolated track coordinates

### OBD Simulation

* RPM, throttle, engine load from recorded logs or synthetic generation
* Treated as asynchronous Bluetooth input

---

## 8. Web Application Purpose

The web application serves as:

* A post-ride analytics dashboard
* A visualization layer for performance metrics
* A comparison tool between laps and sessions

### Core Dashboard Features

* Lap comparison charts
* Lean angle vs speed plots
* Braking heatmaps
* Session-wise improvement trends
* Risk indicator flags

---

## 9. Frontend Expectations (Vibe Coding)

### Design Style

* Motorsport-inspired
* Dark theme preferred
* Clean, minimal, data-dense UI

### Pages / Components

* Upload Ride Data
* Session Overview
* Lap Comparison
* Metric Breakdown
* ML Insights Panel

### Visualization Tools

* Plotly.js / Recharts / D3.js
* Interactive charts
* Hover-based metric inspection

---

## 10. Backend Expectations

### Stack Assumptions

* Python (Flask / FastAPI)
* Pandas + NumPy for processing
* Scikit-learn for ML
* REST APIs for frontend

### Core APIs

* `/upload/session`
* `/metrics/lap`
* `/metrics/session`
* `/ml/insights`

---

## 11. Constraints & Design Decisions

* Low-cost sensors assumed
* No real-time rider feedback in Phase 1
* Focus on post-session analytics
* Simulation-first, hardware-later approach
* Academic + practical balance

---

## 12. Academic Framing

This project emphasizes:

* Quantitative performance analysis
* Metric-driven ML design
* Modular IoT architecture
* Hybrid simulation methodology

The system is intended for academic evaluation, prototyping, and future real-world deployment.

---

## 13. How to Use This File (For AI / Vibe Coding)

* Treat this file as the single source of truth
* Assume all simulated data conforms to defined structures
* Prioritize clarity, explainability, and visual insight
* Do not assume real-time constraints unless specified

---

End of Knowledge Transfer
