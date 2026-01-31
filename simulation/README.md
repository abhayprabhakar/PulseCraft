# RAPTOR Track Simulation

Interactive motorcycle track simulation with real-time telemetry visualization and API backend.

## Features

- **Interactive Track Visualization**: 2D race track with animated motorcycle movement
- **Real-Time Telemetry**: Speed, RPM, throttle, lean angle, G-forces, and lap time
- **Performance Metrics**: Throttle smoothness, max speed, max lean, lateral acceleration
- **Playback Controls**: Play/pause, speed adjustment (0.5x-3x), timeline scrubbing
- **Data Export**: Export sensor data as CSV or JSON via API
- **REST API**: Backend endpoints for data access and analysis

## Quick Start

### 1. Install Dependencies

```bash
cd simulation
pip install -r requirements.txt
```

### 2. Start the API Server

```bash
python api.py
```

The API will be available at `http://localhost:8000`

API Endpoints:
- `GET /api/simulation/data?lap_id=1` - Get sensor data for a lap
- `GET /api/lap/{lap_id}/metrics` - Get performance metrics
- `GET /api/session/summary` - Get session summary
- `POST /api/export/csv?lap_id=1` - Export CSV
- `POST /api/export/json?lap_id=1` - Export JSON

### 3. Open the Frontend

Simply open `index.html` in your web browser. The frontend will:
- Automatically connect to the API at `http://localhost:8000`
- Display the track visualization with animated bike
- Show real-time telemetry data
- Provide playback controls

If the API is not running, the frontend will fall back to client-side simulation.

## Usage

### Playback Controls
- **Play/Pause**: Start or pause the simulation
- **Reset**: Return to the beginning of the lap
- **Speed**: Adjust playback speed (0.5x, 1x, 2x, 3x)
- **Progress Bar**: Click or drag to jump to any point in the lap

### Export Data
Click the "Export CSV" or "Export JSON" buttons to download the current lap data for analysis in external tools.

### Testing the Data Generator

```bash
python data_generator.py
```

This will generate sample data and display metrics in the console.

## Technology Stack

### Backend
- **FastAPI**: Modern Python web framework
- **Pandas**: Data processing and analysis
- **NumPy**: Numerical computations
- **Uvicorn**: ASGI server

### Frontend
- **HTML5 Canvas**: Track and bike visualization
- **Vanilla JavaScript**: Animation and API integration
- **CSS3**: Motorsport-inspired premium design

## Architecture

```
simulation/
├── api.py                 # FastAPI REST server
├── data_generator.py      # Physics-based sensor simulation
├── requirements.txt       # Python dependencies
├── index.html            # Frontend application
├── style.css             # Premium styling
├── simulation.js         # Track visualization & API integration
└── README.md             # This file
```

## Data Model

Sensor data conforms to the PROJECT_CONTEXT.md schema:

```json
{
  "timestamp": 1000,
  "speed_kmph": 145.2,
  "rpm": 11200,
  "throttle_percent": 87.5,
  "accel_x": 2.3,
  "accel_y": 4.1,
  "accel_z": 9.81,
  "gyro_x": 0.5,
  "gyro_y": 0.2,
  "gyro_z": 0.3,
  "lean_angle": 42.5,
  "latitude": 28.4595,
  "longitude": 77.0266
}
```

## Performance Metrics

The system calculates the following metrics:
- **Throttle Smoothness Index**: Standard deviation of throttle input
- **Braking Jerk**: Rate of change of deceleration
- **Lean Angle Variance**: Consistency of lean angles
- **Lateral Acceleration RMS**: Cornering forces
- **Speed-to-Lean Ratio**: Cornering efficiency

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari

## Future Enhancements

- Multi-lap comparison
- Sector-by-sector analysis
- Heat map overlays (speed, lean angle)
- ML-based riding style classification
- Real hardware integration (ESP32)

---

**RAPTOR** - Rider Analytics Platform for Track Optimization
