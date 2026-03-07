"""
RAPTOR API Server - GPS-Correlated Version
FastAPI backend for track simulation data delivery using real GPS coordinates
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Dict, List, Optional
import shutil
import os
import numpy as np
import pandas as pd
import json
import io
from gps_data_generator import (
    GPSTrackData,
    calculate_lean_angle,
    calculate_rpm,
    calculate_throttle,
    calculate_g_forces,
    calculate_gyro
)

app = FastAPI(
    title="RAPTOR API - GPS Correlated",
    description="Rider Analytics Platform for Track Optimization - GPS-Based Data API",
    version="2.1.0"
)

# Global storage for synced data
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
synced_session_data = {}

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=[" *"],
)

# Load GPS coordinates from frontend trackPath.ts
# In real deployment, this could be loaded from a file or database
# For now, we'll use a sample Isle of Man TT GPS data
# User should update this with their actual GPS data

# Sample GPS coordinates - User needs to paste their actual track data here
# This should match the data in raptor-frontend/src/utils/trackPath.ts
GPS_TRACK_DATA = [
    {"lat": 54.167261, "lng": -4.479601},  # Start/Finish
    {"lat": 54.163390, "lng": -4.487290},
    {"lat": 54.158680, "lng": -4.495900},
    {"lat": 54.155630, "lng": -4.501320},
    {"lat": 54.156000, "lng": -4.501810},
    {"lat": 54.159250, "lng": -4.503750},
    {"lat": 54.161400, "lng": -4.506250},
    {"lat": 54.166300, "lng": -4.514320},
    {"lat": 54.168750, "lng": -4.521910},
    {"lat": 54.170520, "lng": -4.528260},
    {"lat": 54.174040, "lng": -4.549590},
    {"lat": 54.181260, "lng": -4.560450},
    {"lat": 54.188580, "lng": -4.577380},
    {"lat": 54.192730, "lng": -4.588420},
    {"lat": 54.192740, "lng": -4.590990},
    {"lat": 54.193800, "lng": -4.597870},
    {"lat": 54.195860, "lng": -4.603930},
    {"lat": 54.197460, "lng": -4.614280},
    {"lat": 54.198670, "lng": -4.619690},
    {"lat": 54.202760, "lng": -4.629180},
    {"lat": 54.207980, "lng": -4.630690},
    {"lat": 54.211480, "lng": -4.630060},
    {"lat": 54.215040, "lng": -4.632930},
    {"lat": 54.217920, "lng": -4.632790},
    {"lat": 54.219390, "lng": -4.630170},
    {"lat": 54.221130, "lng": -4.625810},
    {"lat": 54.222970, "lng": -4.620120},
    {"lat": 54.225950, "lng": -4.617150},
    {"lat": 54.227300, "lng": -4.619080},
    {"lat": 54.229750, "lng": -4.618950},
    {"lat": 54.233670, "lng": -4.615160},
    {"lat": 54.241640, "lng": -4.606200},
    {"lat": 54.245290, "lng": -4.596570},
    {"lat": 54.250160, "lng": -4.589270},
    {"lat": 54.258200, "lng": -4.583220},
    {"lat": 54.268710, "lng": -4.579490},
    {"lat": 54.275250, "lng": -4.579510},
    {"lat": 54.280560, "lng": -4.587440},
    {"lat": 54.283110, "lng": -4.587610},
    {"lat": 54.287830, "lng": -4.581810},
    {"lat": 54.291710, "lng": -4.578750},
    {"lat": 54.293640, "lng": -4.576550},
    {"lat": 54.299810, "lng": -4.569460},
    {"lat": 54.303950, "lng": -4.562610},
    {"lat": 54.306460, "lng": -4.556120},
    {"lat": 54.309130, "lng": -4.544010},
    {"lat": 54.310090, "lng": -4.539380},
    {"lat": 54.312020, "lng": -4.527020},
    {"lat": 54.315620, "lng": -4.513550},
    {"lat": 54.316310, "lng": -4.507400},
    {"lat": 54.317650, "lng": -4.502090},
    {"lat": 54.322350, "lng": -4.479560},
    {"lat": 54.322900, "lng": -4.472830},
    {"lat": 54.321010, "lng": -4.470449},
    {"lat": 54.321090, "lng": -4.462930},
    {"lat": 54.321410, "lng": -4.457440},
    {"lat": 54.320060, "lng": -4.446650},
    {"lat": 54.318710, "lng": -4.435960},
    {"lat": 54.318180, "lng": -4.431879},
    {"lat": 54.319140, "lng": -4.423739},
    {"lat": 54.320480, "lng": -4.415350},
    {"lat": 54.320990, "lng": -4.409120},
    {"lat": 54.321300, "lng": -4.404390},
    {"lat": 54.320760, "lng": -4.392760},
    {"lat": 54.322190, "lng": -4.386680},
    {"lat": 54.316940, "lng": -4.383730},
    {"lat": 54.314020, "lng": -4.383590},
    {"lat": 54.312960, "lng": -4.384940},
    {"lat": 54.313660, "lng": -4.379100},
    {"lat": 54.312790, "lng": -4.376150},
    {"lat": 54.310730, "lng": -4.379279},
    {"lat": 54.306470, "lng": -4.381950},
    {"lat": 54.305330, "lng": -4.383740},
    {"lat": 54.303890, "lng": -4.390659},
    {"lat": 54.300450, "lng": -4.394890},
    {"lat": 54.296940, "lng": -4.404080},
    {"lat": 54.294530, "lng": -4.406200},
    {"lat": 54.293220, "lng": -4.410360},
    {"lat": 54.286710, "lng": -4.422049},
    {"lat": 54.281090, "lng": -4.431310},
    {"lat": 54.278810, "lng": -4.439140},
    {"lat": 54.277000, "lng": -4.444219},
    {"lat": 54.270230, "lng": -4.446130},
    {"lat": 54.264740, "lng": -4.448570},
    {"lat": 54.261890, "lng": -4.449880},
    {"lat": 54.257030, "lng": -4.458580},
    {"lat": 54.252070, "lng": -4.462640},
    {"lat": 54.245870, "lng": -4.466600},
    {"lat": 54.243310, "lng": -4.470140},
    {"lat": 54.240580, "lng": -4.472850},
    {"lat": 54.235410, "lng": -4.474300},
    {"lat": 54.230610, "lng": -4.470100},
    {"lat": 54.223130, "lng": -4.474570},
    {"lat": 54.220300, "lng": -4.478440},
    {"lat": 54.216480, "lng": -4.478400},
    {"lat": 54.212940, "lng": -4.478980},
    {"lat": 54.210670, "lng": -4.475550},
    {"lat": 54.206380, "lng": -4.466960},
    {"lat": 54.188430, "lng": -4.474500},
    {"lat": 54.183590, "lng": -4.475540},
    {"lat": 54.181080, "lng": -4.473400},
    {"lat": 54.179700, "lng": -4.470150},
    {"lat": 54.178220, "lng": -4.471330},
    {"lat": 54.174310, "lng": -4.468640},
    {"lat": 54.172010, "lng": -4.468230},
    {"lat": 54.171670, "lng": -4.467820},
    {"lat": 54.171350, "lng": -4.469150},
    {"lat": 54.167250, "lng": -4.479590},
]

# Initialize GPS track analyzer
gps_track = GPSTrackData(GPS_TRACK_DATA)

# Generate lap data using GPS-correlated method
def generate_gps_lap_data(lap_id: int, points_per_lap: int = 50000) -> pd.DataFrame:
    """
    Generate realistic sensor data correlated to GPS positions
    Points per lap = 50,000 for realistic Isle of Man TT timing:
    - 50,000 points × 0.02s (50Hz) = 1000 seconds = ~16.7 minutes per lap
    """
    
    data = []
    prev_speed = 100  # Start at moderate speed
    
    for i in range(points_per_lap):
        # Calculate position on track (0-1 progress)
        progress = i / points_per_lap
        gps_index = int(progress * len(GPS_TRACK_DATA)) % len(GPS_TRACK_DATA)
        
        # Get GPS coordinates
        gps_coord = GPS_TRACK_DATA[gps_index]
        
        # Calculate speed based on track curvature
        speed = gps_track.get_speed_for_position(gps_index)
        
        # Get corner radius
        radius = gps_track.get_corner_radius(gps_index)
        
        # Calculate lean angle from physics
        lean_angle = calculate_lean_angle(speed, radius)
        
        # Calculate RPM
        rpm = calculate_rpm(speed)
        
        # Calculate throttle position
        throttle = calculate_throttle(speed, gps_track.get_speed_for_position(gps_index + 1), prev_speed)
        
        # Calculate G-forces
        accel_x, accel_y, accel_z = calculate_g_forces(speed, prev_speed, radius)
        
        # Calculate gyroscope readings
        gyro_x, gyro_y, gyro_z = calculate_gyro(lean_angle, speed)
        
        # Timestamp (50Hz data rate = 0.02s per sample)
        timestamp_ms = i * 20
        
        data_point = {
            "timestamp": timestamp_ms,
            "speed_kmph": round(speed, 1),
            "rpm": round(rpm, 0),
            "throttle_percent": round(throttle, 1),
            "accel_x": round(accel_x, 2),
            "accel_y": round(accel_y, 2),
            "accel_z": round(accel_z, 2),
            "gyro_x": round(gyro_x, 3),
            "gyro_y": round(gyro_y, 3),
            "gyro_z": round(gyro_z, 3),
            "lean_angle": round(lean_angle, 1),
            "latitude": gps_coord["lat"],
            "longitude": gps_coord["lng"],
        }
        
        data.append(data_point)
        prev_speed = speed
    
    return pd.DataFrame(data)


# Generate session data on startup
print("Generating GPS-correlated session data...")
current_session = {}
for lap_id in range(1, 4):  # 3 laps
    print(f"  Generating lap {lap_id}...")
    current_session[lap_id] = generate_gps_lap_data(lap_id)
print("Session data ready!")


def detect_corners(df: pd.DataFrame, lean_threshold: float = 15.0) -> List[pd.DataFrame]:
    """Identify corner segments based on lean angle"""
    is_corner = abs(df['lean_angle']) > lean_threshold
    # Create groups of consecutive corner points
    corner_groups = (is_corner != is_corner.shift()).cumsum()
    corners = []
    for _, group in df[is_corner].groupby(corner_groups):
        if len(group) > 10:  # Minimum duration to be a real corner
            corners.append(group)
    return corners

def calculate_braking_score(df: pd.DataFrame) -> float:
    """Score 0-100. Higher is smoother. Based on accel_x jerk."""
    # Filter for braking (negative accel_x)
    braking = df[df['accel_x'] < -0.5]
    if len(braking) < 10:
        return 100.0
    
    # Calculate jerk (derivative of acceleration)
    jerk = braking['accel_x'].diff().abs().mean()
    # Normalize: assume jerk > 0.5 is bad.
    score = max(0, 100 - (jerk * 200)) # Simple heuristic
    return round(score, 1)

def calculate_throttle_aggression(df: pd.DataFrame) -> float:
    """Score 0-100. Higher is more aggressive. Based on throttle derivative."""
    # Positive throttle change
    throttle_diff = df['throttle_percent'].diff()
    positive_diff = throttle_diff[throttle_diff > 0]
    
    if len(positive_diff) == 0:
        return 0.0
        
    avg_rate = positive_diff.mean()
    # 5% change per sample (20ms) is very aggressive (250% per second)
    aggression = min(100, avg_rate * 20) 
    return round(aggression, 1)

def calculate_lean_consistency(df: pd.DataFrame) -> float:
    """Std dev of lean angle within corners. Lower is better."""
    corners = detect_corners(df)
    if not corners:
        return 0.0
        
    variances = []
    for corner in corners:
        # We want smooth consistent arc. 
        # But lean changes during entry/exit. 
        # Look at the middle 50% of the corner?
        mid_idx = len(corner) // 2
        start_q = len(corner) // 4
        end_q = start_q * 3
        if end_q > start_q:
            segment = corner.iloc[start_q:end_q]
            variances.append(segment['lean_angle'].std())
            
    if not variances:
        return 0.0
        
    # Average std dev
    avg_std = np.nanmean(variances)
    return round(float(avg_std), 2)

def calculate_corner_entry_delta(df: pd.DataFrame) -> float:
    """Avg speed loss from braking to apex. Higher means harder braking/faster entry."""
    corners = detect_corners(df)
    deltas = []
    
    for corner in corners:
        apex_idx = corner['lean_angle'].abs().idxmax()
        apex_speed = df.loc[apex_idx, 'speed_kmph']
        
        # Look back 3 seconds (approx 150 frames @ 50Hz) or to start of corner
        start_idx = corner.index[0]
        lookback_idx = max(0, start_idx - 50) # 1 second before corner starts
        
        # Max speed in approaching zone
        entry_speed = df.loc[lookback_idx:apex_idx, 'speed_kmph'].max()
        
        deltas.append(entry_speed - apex_speed)
        
    if not deltas:
        return 0.0
        
    return round(float(np.mean(deltas)), 1)


def calculate_lap_metrics(lap_data: pd.DataFrame) -> Dict:
    """Calculate performance metrics from lap data"""
    lap_time_s = lap_data['timestamp'].max() / 1000.0
    
    metrics = {
        "lap_time_s": round(lap_time_s, 2),
        "max_speed_kmph": round(lap_data['speed_kmph'].max(), 1),
        "max_lean_deg": round(max(abs(lap_data['lean_angle'].min()), 
                                 abs(lap_data['lean_angle'].max())), 1),
        "max_rpm": int(lap_data['rpm'].max()),
        "throttle_smoothness_index": round(1.0 - (lap_data['throttle_percent'].std() / 100.0), 3),
        "braking_jerk": round(lap_data['accel_x'].min(), 2),
        "lean_angle_variance": round(lap_data['lean_angle'].var(), 2),
        "lateral_accel_rms": round((lap_data['accel_y'] ** 2).mean() ** 0.5, 3),
        "speed_to_lean_ratio": round(lap_data['speed_kmph'].mean() / 
                                     max(abs(lap_data['lean_angle']).mean(), 0.1), 2),
                                     
        # Advanced Metrics requested by user
        "braking_smoothness_score": calculate_braking_score(lap_data),
        "throttle_aggression_index": calculate_throttle_aggression(lap_data),
        "lean_angle_consistency": calculate_lean_consistency(lap_data),
        "corner_entry_speed_delta": calculate_corner_entry_delta(lap_data),
    }
    
    return metrics


@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "service": "RAPTOR API - GPS Correlated",
        "version": "2.0.0",
        "gps_track": {
            "total_points": len(GPS_TRACK_DATA),
            "total_distance_m": round(gps_track.total_distance, 1),
            "estimated_lap_time_s": "~1020s (17 min)"
        },
        "endpoints": {
            "simulation_data": "/api/simulation/data",
            "lap_metrics": "/api/lap/{lap_id}/metrics",
            "session_summary": "/api/session/summary",
            "export_csv": "/api/export/csv",
            "export_json": "/api/export/json"
        }
    }


@app.get("/api/simulation/data")
async def get_simulation_data(lap_id: int = 1):
    """Stream GPS-correlated sensor data for a specific lap"""
    if lap_id not in current_session:
        raise HTTPException(status_code=404, detail=f"Lap {lap_id} not found")
    
    lap_data = current_session[lap_id]
    data_points = lap_data.to_dict('records')
    
    return JSONResponse(content={
        "lap_id": lap_id,
        "total_points": len(data_points),
        "data": data_points
    })


@app.get("/api/lap/{lap_id}/metrics")
async def get_lap_metrics(lap_id: int):
    """Calculate and return performance metrics for a specific lap"""
    if lap_id not in current_session:
        raise HTTPException(status_code=404, detail=f"Lap {lap_id} not found")
    
    lap_data = current_session[lap_id]
    metrics = calculate_lap_metrics(lap_data)
    
    return JSONResponse(content={
        "lap_id": lap_id,
        "metrics": metrics
    })


@app.get("/api/session/summary")
async def get_session_summary():
    """Get session-level aggregated statistics"""
    session_metrics = []
    
    for lap_id, lap_data in current_session.items():
        metrics = calculate_lap_metrics(lap_data)
        metrics['lap_id'] = lap_id
        session_metrics.append(metrics)
    
    lap_times = [m['lap_time_s'] for m in session_metrics]
    
    summary = {
        "total_laps": len(current_session),
        "best_lap_time": min(lap_times),
        "average_lap_time": sum(lap_times) / len(lap_times),
        "lap_times": lap_times,
        "laps": session_metrics
    }
    
    return JSONResponse(content=summary)


@app.post("/api/export/csv")
async def export_csv(lap_id: int = None):
    """Export sensor data as CSV"""
    if lap_id:
        if lap_id not in current_session:
            raise HTTPException(status_code=404, detail=f"Lap {lap_id} not found")
        
        data = current_session[lap_id].copy()
        data['lap_id'] = lap_id
        filename = f"raptor_lap_{lap_id}.csv"
    else:
        all_data = []
        for lap_id, lap_data in current_session.items():
            lap_copy = lap_data.copy()
            lap_copy['lap_id'] = lap_id
            all_data.append(lap_copy)
        
        data = pd.concat(all_data, ignore_index=True)
        filename = "raptor_session.csv"
    
    stream = io.StringIO()
    data.to_csv(stream, index=False)
    
    response = StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv"
    )
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    
    return response


@app.post("/api/export/json")
async def export_json(lap_id: int = None):
    """Export complete session data as JSON"""
    if lap_id:
        if lap_id not in current_session:
            raise HTTPException(status_code=404, detail=f"Lap {lap_id} not found")
        
        export_data = {
            "lap_id": lap_id,
            "metrics": calculate_lap_metrics(current_session[lap_id]),
            "data": current_session[lap_id].to_dict('records')
        }
        filename = f"raptor_lap_{lap_id}.json"
    else:
        export_data = {
            "session": {
                "total_laps": len(current_session),
            },
            "laps": []
        }
        
        for lap_id, lap_data in current_session.items():
            lap_export = {
                "lap_id": lap_id,
                "metrics": calculate_lap_metrics(lap_data),
                "data": lap_data.to_dict('records')
            }
            export_data["laps"].append(lap_export)
        
        filename = "raptor_session.json"
    
    json_str = json.dumps(export_data, indent=2)
    
    response = StreamingResponse(
        iter([json_str]),
        media_type="application/json"
    )
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    
    return response


@app.post("/api/upload_csv")
async def upload_csv(file: UploadFile = File(...)):
    """Upload and sync CSV telemetry data"""
    try:
        file_path = os.path.join(UPLOAD_DIR, "latest_telemetry.csv")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Parse CSV immediately to header check and load
        df = pd.read_csv(file_path)
        
        # Basic validation of required columns
        required_cols = ['timestamp', 'speed_kph', 'lean_angle', 'rpm', 'throttle_percent', 'accel_x', 'accel_y']
        missing = [col for col in required_cols if col not in df.columns]
        
        # Map columns if needed (handle slight naming variations if user provided loosely)
        # The user provided: timestamp lean_angle pitch yaw accel_x accel_y accel_z speed_kph rpm latitude longitude engine_rpm vehicle_speed_kph throttle_percent coolant_temp_c intake_pressure_kpa
        # My data generator uses: speed_kmph, but user CSV has speed_kph. I should standardize.
        
        # Auto-standardize column names
        rename_map = {
            'speed_kph': 'speed_kmph',
            'vehicle_speed_kph': 'speed_kmph',
            'engine_rpm': 'rpm'
        }
        df.rename(columns=rename_map, inplace=True)
        
        # Recalculate 'lap_id' if not present based on timestamps or simple segmentation?
        # For now, assume single session or user provides lap_id. 
        # If no lap_id, treat as Lap 1.
        if 'lap_id' not in df.columns:
            df['lap_id'] = 1
            
        # Update current_session global with this new data
        # Clear existing simulated data? Or keep side-by-side?
        # User said "using all the data from csv file when it syncs", so replace.
        global current_session
        current_session = {}
        
        for lap_id in df['lap_id'].unique():
            current_session[int(lap_id)] = df[df['lap_id'] == lap_id].reset_index(drop=True)
            
        return {"status": "success", "message": "Telemetry synced successfully", "laps": int(df['lap_id'].nunique())}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    print("\n🏍️  RAPTOR API - GPS Correlated Edition")
    print("="  * 50)
    print(f"📍 Track: Isle of Man TT ({len(GPS_TRACK_DATA)} GPS points)")
    print(f"📊 Distance: ~{round(gps_track.total_distance/1000, 1)} km")
    print("🚀 Starting server...\n")
    uvicorn.run("api:app", host="0.0.0.0", port=8008, reload=True)
