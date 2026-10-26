export interface User {
    id: number;
    email: string;
    full_name?: string;
    profile_picture_url?: string;
    created_at: string;
}

export interface UserStats {
    total_rides: number;
    total_distance_km: number;
    max_speed_kph: number;
    total_hours: number;
    favorite_bike: string;
    total_data_bytes?: number;
    following_count?: number;
    followers_count?: number;
}
