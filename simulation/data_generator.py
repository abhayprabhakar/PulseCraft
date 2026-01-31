"""
RAPTOR Data Generator
Generates realistic sensor data for motorcycle track simulation
Conforms to PROJECT_CONTEXT.md schema
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Tuple
import math


class TrackDataGenerator:
    """Generates realistic sensor data for a simulated track lap"""
    
    def __init__(self, track_length_m: float = 2400, sample_rate_hz: int = 50):
        """
        Args:
            track_length_m: Total track length in meters
            sample_rate_hz: Data sampling frequency (Hz)
        """
        self.track_length = track_length_m
        self.sample_rate = sample_rate_hz
        self.dt = 1.0 / sample_rate_hz  # Time step in seconds
        
        # Track sections: (start_pct, end_pct, type, radius_m)
        # type: 'straight', 'left', 'right'
        self.track_sections = [
            (0.0, 0.15, 'straight', None),
            (0.15, 0.25, 'right', 80),
            (0.25, 0.35, 'straight', None),
            (0.35, 0.50, 'left', 60),
            (0.50, 0.65, 'straight', None),
            (0.65, 0.75, 'right', 70),
            (0.75, 0.85, 'left', 90),
            (0.85, 1.0, 'straight', None),
        ]
        
        # Starting coordinates (arbitrary track location)
        self.start_lat = 28.4595
        self.start_lon = 77.0266
        
    def get_section_at_position(self, progress: float) -> Tuple[str, float]:
        """Get track section type and radius at given progress (0-1)"""
        for start, end, section_type, radius in self.track_sections:
            if start <= progress < end:
                return section_type, radius if radius else 0
        return 'straight', 0
    
    def calculate_target_speed(self, section_type: str, radius: float) -> float:
        """Calculate realistic speed for section type"""
        if section_type == 'straight':
            return np.random.uniform(140, 160)  # km/h
        else:
            # Corner speed based on radius (smaller radius = slower)
            base_speed = min(120, radius * 1.2)
            return np.random.uniform(base_speed * 0.9, base_speed * 1.1)
    
    def calculate_lean_angle(self, speed_kmh: float, radius_m: float) -> float:
        """Calculate lean angle using physics (v²/rg)"""
        if radius_m == 0:
            return 0.0
        
        speed_ms = speed_kmh / 3.6
        g = 9.81
        
        # Lean angle = arctan(v²/rg)
        angle_rad = math.atan((speed_ms ** 2) / (radius_m * g))
        angle_deg = math.degrees(angle_rad)
        
        # Add small variation
        angle_deg += np.random.normal(0, 1.5)
        
        # Clamp to realistic range
        return np.clip(angle_deg, -55, 55)
    
    def generate_lap_data(self, lap_number: int = 1) -> pd.DataFrame:
        """Generate complete sensor data for one lap"""
        
        # Estimate lap time (avg 90 seconds)
        lap_time_s = np.random.uniform(85, 95)
        num_samples = int(lap_time_s * self.sample_rate)
        
        data = []
        distance_traveled = 0
        current_speed = 60.0  # Start speed in km/h
        
        for i in range(num_samples):
            t = i * self.dt
            progress = distance_traveled / self.track_length
            
            # Get current section
            section_type, radius = self.get_section_at_position(progress)
            target_speed = self.calculate_target_speed(section_type, radius)
            
            # Smooth speed transition
            speed_diff = target_speed - current_speed
            current_speed += speed_diff * 0.05  # Gradual acceleration/deceleration
            
            # Add small variation
            speed = current_speed + np.random.normal(0, 2)
            speed = max(40, min(160, speed))  # Clamp speed
            
            # Calculate lean angle
            if section_type in ['left', 'right']:
                lean_angle = self.calculate_lean_angle(speed, radius)
                if section_type == 'left':
                    lean_angle = -abs(lean_angle)
                else:
                    lean_angle = abs(lean_angle)
            else:
                lean_angle = np.random.normal(0, 2)  # Small wobble on straights
            
            # Calculate throttle position (0-100%)
            if speed < target_speed:
                throttle = np.random.uniform(70, 95)
            elif section_type != 'straight' and abs(lean_angle) > 15:
                throttle = np.random.uniform(30, 50)  # Maintenance throttle in corners
            else:
                throttle = np.random.uniform(50, 70)
            
            # Calculate RPM (correlated with speed and throttle)
            rpm_base = (speed / 160) * 12000  # Max RPM at max speed
            rpm = rpm_base + (throttle / 100) * 2000 + np.random.normal(0, 200)
            rpm = int(max(2000, min(14000, rpm)))
            
            # Calculate accelerations
            accel_x = (throttle / 100) * 3.0 + np.random.normal(0, 0.3)  # Longitudinal
            
            # Lateral acceleration from cornering
            if radius > 0:
                speed_ms = speed / 3.6
                accel_y = (speed_ms ** 2) / radius
                if section_type == 'left':
                    accel_y = -accel_y
                accel_y += np.random.normal(0, 0.2)
            else:
                accel_y = np.random.normal(0, 0.1)
            
            accel_z = 9.81 + np.random.normal(0, 0.2)  # Vertical (gravity + vibration)
            
            # Gyroscope (angular velocity around lean axis)
            if section_type in ['left', 'right']:
                gyro_x = lean_angle * 0.1 + np.random.normal(0, 0.5)
            else:
                gyro_x = np.random.normal(0, 0.2)
            
            gyro_y = np.random.normal(0, 0.2)
            gyro_z = np.random.normal(0, 0.3)
            
            # GPS coordinates (simple linear interpolation along track)
            lat_offset = (progress * 0.02) * math.cos(progress * 2 * math.pi)
            lon_offset = (progress * 0.02) * math.sin(progress * 2 * math.pi)
            
            latitude = self.start_lat + lat_offset
            longitude = self.start_lon + lon_offset
            
            # Update distance traveled
            distance_traveled += (speed / 3.6) * self.dt
            
            # Append data point
            data.append({
                'timestamp': int(t * 1000),  # milliseconds
                'speed_kmph': round(speed, 2),
                'rpm': rpm,
                'throttle_percent': round(throttle, 2),
                'accel_x': round(accel_x, 3),
                'accel_y': round(accel_y, 3),
                'accel_z': round(accel_z, 3),
                'gyro_x': round(gyro_x, 3),
                'gyro_y': round(gyro_y, 3),
                'gyro_z': round(gyro_z, 3),
                'lean_angle': round(lean_angle, 2),
                'latitude': round(latitude, 6),
                'longitude': round(longitude, 6)
            })
        
        return pd.DataFrame(data)
    
    def generate_session(self, num_laps: int = 5) -> Dict[int, pd.DataFrame]:
        """Generate multiple laps for a session"""
        session_data = {}
        for lap in range(1, num_laps + 1):
            session_data[lap] = self.generate_lap_data(lap)
        return session_data


def calculate_lap_metrics(lap_df: pd.DataFrame) -> Dict:
    """Calculate performance metrics for a lap"""
    
    # Lap time
    lap_time_s = lap_df['timestamp'].iloc[-1] / 1000.0
    
    # Throttle smoothness (lower std = smoother)
    throttle_smoothness = lap_df['throttle_percent'].std()
    
    # Braking jerk (rate of change of deceleration)
    accel_change = lap_df['accel_x'].diff().abs()
    braking_jerk = accel_change.mean()
    
    # Lean angle variance
    lean_variance = lap_df['lean_angle'].var()
    
    # Lateral acceleration RMS
    lateral_accel_rms = np.sqrt((lap_df['accel_y'] ** 2).mean())
    
    # Speed-to-lean ratio (efficiency in corners)
    corner_data = lap_df[lap_df['lean_angle'].abs() > 15]
    if len(corner_data) > 0:
        speed_to_lean = (corner_data['speed_kmph'] / corner_data['lean_angle'].abs()).mean()
    else:
        speed_to_lean = 0
    
    # Max values
    max_speed = lap_df['speed_kmph'].max()
    max_lean = lap_df['lean_angle'].abs().max()
    max_rpm = lap_df['rpm'].max()
    
    return {
        'lap_time_s': round(lap_time_s, 2),
        'max_speed_kmph': round(max_speed, 2),
        'max_lean_deg': round(max_lean, 2),
        'max_rpm': int(max_rpm),
        'throttle_smoothness_index': round(throttle_smoothness, 2),
        'braking_jerk': round(braking_jerk, 3),
        'lean_angle_variance': round(lean_variance, 2),
        'lateral_accel_rms': round(lateral_accel_rms, 3),
        'speed_to_lean_ratio': round(speed_to_lean, 2)
    }


if __name__ == "__main__":
    # Test data generation
    generator = TrackDataGenerator()
    lap_data = generator.generate_lap_data(1)
    print(f"Generated {len(lap_data)} data points")
    print("\nSample data:")
    print(lap_data.head(10))
    print("\nLap metrics:")
    print(calculate_lap_metrics(lap_data))
