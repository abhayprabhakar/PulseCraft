"""
GPS-Correlated Data Generator for Track Simulation
Calculates realistic telemetry based on actual GPS track data
"""
import math
import json
from typing import List, Tuple, Dict

class GPSTrackData:
    """Handles GPS coordinate processing and track analysis"""
    
    def __init__(self, gps_coords: List[Dict[str, float]]):
        """
        Initialize with GPS coordinates
        gps_coords: List of {lat, lng} dictionaries
        """
        self.coords = gps_coords
        self.num_points = len(gps_coords)
        self.curvatures = self._calculate_curvatures()
        self.distances = self._calculate_distances()
        self.total_distance = sum(self.distances)
        
    def _haversine_distance(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """Calculate distance between two GPS points in meters"""
        R = 6371000  # Earth radius in meters
        
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lng2 - lng1)
        
        a = (math.sin(delta_phi / 2) ** 2 + 
             math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def _calculate_distances(self) -> List[float]:
        """Calculate distance between consecutive GPS points"""
        distances = []
        for i in range(len(self.coords) - 1):
            c1 = self.coords[i]
            c2 = self.coords[i + 1]
            dist = self._haversine_distance(c1['lat'], c1['lng'], c2['lat'], c2['lng'])
            distances.append(dist)
        # Add distance from last point to first (closing the loop)
        c1 = self.coords[-1]
        c2 = self.coords[0]
        distances.append(self._haversine_distance(c1['lat'], c1['lng'], c2['lat'], c2['lng']))
        return distances
    
    def _calculate_curvature(self, p1: Dict, p2: Dict, p3: Dict) -> float:
        """
        Calculate curvature at p2 using three points
        Returns curvature in 1/meters (higher = tighter corner)
        """
        # Calculate distances
        a = self._haversine_distance(p1['lat'], p1['lng'], p2['lat'], p2['lng'])
        b = self._haversine_distance(p2['lat'], p2['lng'], p3['lat'], p3['lng'])
        c = self._haversine_distance(p1['lat'], p1['lng'], p3['lat'], p3['lng'])
        
        if a == 0 or b == 0 or c == 0:
            return 0
        
        # Menger curvature formula
        try:
            area = abs((p2['lat'] - p1['lat']) * (p3['lng'] - p1['lng']) - 
                      (p3['lat'] - p1['lat']) * (p2['lng'] - p1['lng']))
            curvature = 4 * area / (a * b * c) if (a * b * c) > 0 else 0
            return curvature * 100000  # Scale for readability
        except:
            return 0
    
    def _calculate_curvatures(self) -> List[float]:
        """Calculate curvature at each point"""
        curvatures = []
        n = len(self.coords)
        
        for i in range(n):
            prev_idx = (i - 1) % n
            next_idx = (i + 1) % n
            
            p1 = self.coords[prev_idx]
            p2 = self.coords[i]
            p3 = self.coords[next_idx]
            
            curv = self._calculate_curvature(p1, p2, p3)
            curvatures.append(curv)
        
        return curvatures
    
    def get_speed_for_position(self, index: int) -> float:
        """
        Calculate realistic speed based on track curvature
        For Isle of Man TT:
        - Straightaways: 250-320 km/h
        - Medium corners: 120-180 km/h
        - Tight corners: 60-100 km/h
        - Villages: 50-80 km/h
        """
        index = index % self.num_points
        curvature = self.curvatures[index]
        
        # Define speed based on curvature
        if curvature < 0.5:  # Very straight
            base_speed = 280
            variation = 40
        elif curvature < 1.5:  # Gentle curves
            base_speed = 200
            variation = 30
        elif curvature < 3.0:  # Medium corners
            base_speed = 150
            variation = 30
        elif curvature < 5.0:  # Tight corners
            base_speed = 100
            variation = 20
        else:  # Very tight corners / villages
            base_speed = 70
            variation = 15
        
        # Add some randomness
        import random
        speed = base_speed + random.uniform(-variation, variation)
        return max(50, min(320, speed))  # Clamp between 50-320 km/h
    
    def get_corner_radius(self, index: int) -> float:
        """Estimate corner radius from curvature"""
        index = index % self.num_points
        curvature = self.curvatures[index]
        
        if curvature < 0.001:
            return 10000  # Very large radius (straight)
        
        # Inverse of curvature approximates radius
        radius = 1000 / max(curvature, 0.1)
        return max(10, min(1000, radius))  # Clamp between 10-1000m


def calculate_lean_angle(speed_kmph: float, radius_m: float) -> float:
    """
    Calculate motorcycle lean angle using physics
    theta = arctan(v^2 / (r * g))
    """
    speed_ms = speed_kmph / 3.6  # Convert to m/s
    g = 9.81  # Gravity
    
    if radius_m < 10:
        radius_m = 10  # Minimum radius
    
    angle_rad = math.atan((speed_ms ** 2) / (radius_m * g))
    angle_deg = math.degrees(angle_rad)
    
    # Clamp to realistic motorcycle lean angles
    return max(-55, min(55, angle_deg))


def calculate_rpm(speed_kmph: float, gear: int = 5) -> float:
    """
    Estimate RPM based on speed and gear
    Assuming sport bike with ~320 km/h top speed at 14000 RPM
    """
    # Simple linear relationship based on gear
    if speed_kmph < 50:
        gear = 2
        rpm = 3000 + (speed_kmph / 50) * 4000
    elif speed_kmph < 100:
        gear = 3
        rpm = 4000 + ((speed_kmph - 50) / 50) * 4000
    elif speed_kmph < 150:
        gear = 4
        rpm = 5000 + ((speed_kmph - 100) / 50) * 4000
    elif speed_kmph < 220:
        gear = 5
        rpm = 6000 + ((speed_kmph - 150) / 70) * 5000
    else:
        gear = 6
        rpm = 7000 + ((speed_kmph - 220) / 100) * 6000
    
    return min(14000, max(2000, rpm))


def calculate_throttle(speed_kmph: float, target_speed: float, prev_speed: float) -> float:
    """Calculate throttle position based on acceleration"""
    if speed_kmph < target_speed:
        # Accelerating
        diff = target_speed - speed_kmph
        throttle = 40 + min(60, diff * 2)
    else:
        # Decelerating or maintaining
        diff = speed_kmph - target_speed
        throttle = max(0, 40 - diff * 2)
    
    # Add smoothing based on previous speed
    if speed_kmph > prev_speed + 5:
        throttle = min(100, throttle + 20)
    elif speed_kmph < prev_speed - 5:
        throttle = max(0, throttle - 30)
    
    return max(0, min(100, throttle))


def calculate_g_forces(speed_kmph: float, prev_speed_kmph: float, 
                      radius_m: float, dt: float = 0.02) -> Tuple[float, float, float]:
    """
    Calculate G-forces
    Returns: (accel_x, accel_y, accel_z)
    """
    speed_ms = speed_kmph / 3.6
    prev_speed_ms = prev_speed_kmph / 3.6
    
    # Longitudinal acceleration (forward/back)
    accel_x = (speed_ms - prev_speed_ms) / dt
    
    # Lateral acceleration (cornering)
    if radius_m > 0:
        accel_y = (speed_ms ** 2) / radius_m
        # Add direction based on which way we're turning
        import random
        accel_y *= random.choice([-1, 1])
    else:
        accel_y = 0
    
    # Vertical (mostly gravity + bumps)
    accel_z = -9.81 + random.uniform(-0.5, 0.5)
    
    return (accel_x, accel_y, accel_z)


def calculate_gyro(lean_angle: float, speed_kmph: float) -> Tuple[float, float, float]:
    """
    Calculate angular velocities (gyroscope)
    Returns: (gyro_x, gyro_y, gyro_z) in rad/s
    """
    import random
    
    # Lean rate (roll)
    gyro_x = lean_angle * 0.02 + random.uniform(-0.1, 0.1)
    
    # Pitch (acceleration/braking)
    speed_change = random.uniform(-5, 5)
    gyro_y = speed_change * 0.01
    
    # Yaw (turning rate)
    gyro_z = abs(lean_angle) * 0.03 + random.uniform(-0.05, 0.05)
    
    return (gyro_x, gyro_y, gyro_z)
