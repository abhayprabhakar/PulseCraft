import pandas as pd
import numpy as np
from sklearn.cluster import KMeans

# In a real-world scenario, you would train this model on a historical database of thousands of trips.
# For now, we will provide a skeletal function that cluster trips if given a historical dataset,
# or simply apply a pre-defined heuristic if fitting a single ride.

def extract_trip_features(df: pd.DataFrame) -> dict:
    """Extract standard features for a single trip to feed into an ML model."""
    features = {
        'speed_variance': 0.0,
        'throttle_variance': 0.0,
        'rpm_variance': 0.0,
    }
    
    if not df.empty:
        if 'speed_kph' in df.columns:
            features['speed_variance'] = float(df['speed_kph'].var()) if pd.notna(df['speed_kph'].var()) else 0.0
        if 'throttle_percent' in df.columns:
            features['throttle_variance'] = float(df['throttle_percent'].var()) if pd.notna(df['throttle_percent'].var()) else 0.0
        if 'engine_rpm' in df.columns:
            features['rpm_variance'] = float(df['engine_rpm'].var()) if pd.notna(df['engine_rpm'].var()) else 0.0
            
    return features


def cluster_rides(historical_trips_features: list) -> list:
    """
    Fits a KMeans model to a list of trip feature dictionaries.
    Returns the cluster labels.
    """
    if len(historical_trips_features) < 3:
        # Not enough data to cluster meaningfully, return defaults
        return [0] * len(historical_trips_features)
        
    df_features = pd.DataFrame(historical_trips_features)
    
    # Fill NA with 0
    df_features = df_features.fillna(0)
    
    # 3 Clusters: e.g., Relaxed, Normal, Sport
    kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
    labels = kmeans.fit_predict(df_features)
    
    return labels.tolist()
