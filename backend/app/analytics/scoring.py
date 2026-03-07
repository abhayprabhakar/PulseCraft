import pandas as pd
import numpy as np

def calculate_smoothness_score(df: pd.DataFrame) -> int:
    """
    Calculate a smoothness score from 0-100.
    100 = perfectly smooth (low variance in throttle and accel)
    0 = very erratic
    """
    if df.empty or 'speed_kph' not in df.columns:
        return 100

    score = 100
    
    # Speed variance penalty
    if len(df) > 10:
        speed_std = df['speed_kph'].std()
        if pd.notna(speed_std):
            # Penalty scales with std deviation of speed
            penalty = min(speed_std * 1.5, 40) 
            score -= penalty
            
    # Throttle variance penalty
    if 'throttle_percent' in df.columns and len(df) > 10:
        throttle_std = df['throttle_percent'].std()
        if pd.notna(throttle_std):
            penalty = min(throttle_std * 0.8, 30)
            score -= penalty

    return max(0, int(round(score)))

def calculate_efficiency_score(df: pd.DataFrame) -> int:
    """
    Calculate an efficiency proxy score from 0-100 based on engine load and speeds.
    100 = highly efficient cruising
    0 = very inefficient (high revs, low speed, or harsh throttle)
    """
    if df.empty:
        return 100

    score = 100
    total_rows = len(df)
    
    if 'throttle_percent' in df.columns and 'speed_kph' in df.columns:
        # High throttle, low speed (Inefficient / Launching hard)
        inefficient_rows = df[(df['throttle_percent'] > 50) & (df['speed_kph'] < 30)]
        inefficient_ratio = len(inefficient_rows) / total_rows
        score -= (inefficient_ratio * 100) # Heavy penalty
        
    if 'engine_rpm' in df.columns and 'speed_kph' in df.columns:
        # High RPM, low speed (Lugging/over-revving first gear)
        over_rev_rows = df[(df['engine_rpm'] > 6000) & (df['speed_kph'] < 40)]
        over_rev_ratio = len(over_rev_rows) / total_rows
        score -= (over_rev_ratio * 50)

    # Reward steady cruising
    if 'speed_kph' in df.columns and total_rows > 10:
        speed_std = df['speed_kph'].std()
        if pd.notna(speed_std) and speed_std < 5.0 and df['speed_kph'].mean() > 30:
            score += 10 # Bonus for smooth cruising

    return min(100, max(0, int(round(score))))

def classify_riding_style(smoothness: int, efficiency: int, events_count: int) -> str:
    """
    Rule-based classification of the ride.
    """
    if events_count > 10 or smoothness < 40:
        return "Aggressive"
    elif smoothness > 80 and efficiency > 80:
        return "Calm"
    else:
        return "Moderate"
