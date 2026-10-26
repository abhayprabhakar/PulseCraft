export interface SensorData {
    timestamp: number;
    speed_kmph: number;
    rpm: number;
    throttle_percent: number;
    accel_x: number;
    accel_y: number;
    accel_z: number;
    gyro_x: number;
    gyro_y: number;
    gyro_z: number;
    lean_angle: number;
    latitude: number;
    longitude: number;
}

export interface LapMetrics {
    lap_time_s: number;
    max_speed_kmph: number;
    max_lean_deg: number;
    max_rpm: number;
    throttle_smoothness_index: number;
    braking_jerk: number;
    lean_angle_variance: number;
    lateral_accel_rms: number;
    speed_to_lean_ratio: number;
}

export interface SessionSummary {
    total_laps: number;
    best_lap_time: number;
    average_lap_time: number;
    lap_times: number[];
    laps: (LapMetrics & { lap_id: number })[];
}

export interface SimulationDataResponse {
    lap_id: number;
    total_points: number;
    data: SensorData[];
}

export interface LapMetricsResponse {
    lap_id: number;
    metrics: LapMetrics;
}

export type PlaybackState = 'playing' | 'paused' | 'stopped';

export interface TrackPosition {
    x: number;
    y: number;
    angle: number;
}
