import pandas as pd
import numpy as np
from datetime import datetime

def apply_kinematic_smoothing(df: pd.DataFrame, speed_col: str = 'speed_kph', time_col: str = 'timestamp') -> pd.DataFrame:
    """
    Applies an Alpha-Beta filter (a simplified 1D Kalman Filter) to noisy GPS speed
    to derive physically accurate velocity and acceleration without sensor glitch spikes.
    """
    df = df.copy()
    
    # Ensure timestamp is datetime
    if not pd.api.types.is_datetime64_any_dtype(df[time_col]):
        df[time_col] = pd.to_datetime(df[time_col])
        
    dt_sec = df[time_col].diff().dt.total_seconds().fillna(0.1).values
    meas_v = (df[speed_col] * 0.27778).values # Convert km/h to m/s
    
    n = len(df)
    opt_v = np.zeros(n)
    opt_a = np.zeros(n)
    
    if n == 0:
        df['filtered_velocity_mps'] = opt_v
        df['filtered_accel_mps2'] = opt_a
        return df
        
    # Alpha-Beta tuning (low alpha/beta = trusts physics/momentum >> GPS spikes)
    alpha = 0.25 # responsiveness to GPS speed changes
    beta = 0.05  # responsiveness to GPS acceleration changes
    
    # Initial state
    v_est = meas_v[0] if n > 0 else 0.0
    a_est = 0.0
    
    for i in range(n):
        dt = dt_sec[i] if dt_sec[i] > 0 else 0.1
        if dt > 5.0: # Huge time gap, reset filter tracking
            v_est = meas_v[i]
            a_est = 0.0
            dt = 0.1
            
        # 1. Prediction step (pure kinematics)
        v_pred = v_est + a_est * dt
        a_pred = a_est
        
        # 2. Measurement residual
        residual = meas_v[i] - v_pred
        
        # 3. Update step
        v_est = v_pred + alpha * residual
        a_est = a_pred + (beta / dt) * residual
        
        # 4. Physical constraints (Clamp acceleration to motorbike physics)
        a_est = np.clip(a_est, -15.0, 10.0) 
        
        opt_v[i] = v_est
        opt_a[i] = a_est
        
    df['filtered_velocity_mps'] = opt_v
    df['filtered_accel_mps2'] = opt_a
    return df

def detect_acceleration_events(df: pd.DataFrame):
    """
    Detect hard acceleration and hard braking events from speed time-series.
    Requires 'timestamp' and 'speed_kph' columns.
    """
    if df.empty or 'speed_kph' not in df.columns or 'timestamp' not in df.columns:
        return []

    # Ensure timestamp is datetime and sort
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)

    # Use Alpha-Beta Kinematic Smoother for physics-accurate vehicle tracking
    df = apply_kinematic_smoothing(df)
    
    events = []

    # Thresholds - tuned to be slightly more forgiving for consumer GPS
    HARD_ACCEL_THRESHOLD = 3.5  # m/s^2 (Approx 0.35g)
    HARD_BRAKE_THRESHOLD = -4.5 # m/s^2 (Approx 0.45g)

    # Debounce tracking (do not trigger new event if within X seconds of previous)
    last_event_time = -9999
    EVENT_COOLDOWN = 3.0 # seconds

    for i in range(1, len(df)):
        accel = df.loc[i, 'filtered_accel_mps2']
        current_time = df.loc[i, 'timestamp'].timestamp()
        
        if pd.isna(accel):
            continue

        if current_time - last_event_time < EVENT_COOLDOWN:
            continue

        if accel > HARD_ACCEL_THRESHOLD:
            events.append({
                'type': 'hard_acceleration',
                'timestamp': df.loc[i, 'timestamp'].isoformat(),
                'magnitude_mps2': round(float(accel), 2),
                'speed_kph': round(float(df.loc[i, 'speed_kph']), 1)
            })
            last_event_time = current_time
        elif accel < HARD_BRAKE_THRESHOLD:
            events.append({
                'type': 'hard_braking',
                'timestamp': df.loc[i, 'timestamp'].isoformat(),
                'magnitude_mps2': round(float(accel), 2),
                'speed_kph': round(float(df.loc[i, 'speed_kph']), 1)
            })
            last_event_time = current_time

    return events

def calculate_gear_analytics(df: pd.DataFrame):
    """
    Calculate time spent and average RPM per calculated gear.
    Requires 'calculated_gear', 'engine_rpm', and 'timestamp'.
    """
    if df.empty or 'calculated_gear' not in df.columns or 'timestamp' not in df.columns:
        return []
    
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)
    df['dt_sec'] = df['timestamp'].diff().dt.total_seconds().fillna(0)
    
    # Cap dt to avoid huge gaps skewing data
    df.loc[df['dt_sec'] > 10, 'dt_sec'] = 1 
    
    # Group by gear
    gear_stats = []
    
    # Use engine_rpm if exists, else rpm
    rpm_col = 'engine_rpm' if 'engine_rpm' in df.columns else 'rpm' if 'rpm' in df.columns else None

    if rpm_col:
        grouped = df.groupby('calculated_gear').agg({
            'dt_sec': 'sum',
            rpm_col: 'mean'
        }).reset_index()
        # standardize col name for the rest of function
        grouped = grouped.rename(columns={rpm_col: 'engine_rpm'})
    else:
        grouped = df.groupby('calculated_gear').agg({
            'dt_sec': 'sum'
        }).reset_index()
        grouped['engine_rpm'] = 0

    for _, row in grouped.iterrows():
        gear_val = row['calculated_gear']
        if pd.isna(gear_val):
            continue
            
        gear_stats.append({
            'gear': int(gear_val),
            'time_seconds': round(float(row['dt_sec']), 1),
            'avg_rpm': round(float(row['engine_rpm']), 0)
        })
        
    # Sort by gear ascending
    gear_stats = sorted(gear_stats, key=lambda x: x['gear'])
    return gear_stats
