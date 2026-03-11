from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

class TelemetryFrame(BaseModel):
    timestamp_ms: int
    lat: float
    lng: float
    speed_kph: float
    lean_angle: float
    rpm: int
    throttle: float
    # Extended metrics
    pitch: Optional[float] = 0.0
    yaw: Optional[float] = 0.0
    accel_x: Optional[float] = 0.0
    accel_y: Optional[float] = 0.0
    accel_z: Optional[float] = 0.0
    engine_rpm: Optional[float] = 0.0
    vehicle_speed_kph: Optional[float] = 0.0
    throttle_percent: Optional[float] = 0.0
    coolant_temp_c: Optional[float] = 0.0
    intake_pressure_kpa: Optional[float] = 0.0
    battery_v: Optional[float] = 0.0
    calculated_gear: Optional[int] = 0

class RideCreate(BaseModel):
    id: str
    started_at: datetime
    title: str = "Untitled Ride"
    frames: List[dict] # Accepting raw dicts to be flexible with incoming JSON
    bike_id: Optional[int] = None
    laps: Optional[List[dict]] = []

class RideSummary(BaseModel):
    id: str
    title: str
    started_at: datetime
    duration_seconds: int
    max_speed: Optional[float] = 0.0
    avg_speed: Optional[float] = 0.0
    max_lean_left: Optional[float] = 0.0
    max_lean_right: Optional[float] = 0.0
    max_rpm: Optional[int] = 0
    total_distance_km: Optional[float] = 0.0
    bike_id: Optional[int] = None
    bike_name: Optional[str] = None
    map_preview_points: Optional[List[List[float]]] = None
    laps: Optional[List[dict]] = []
    visibility: Optional[str] = "private"
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None

    class Config:
        from_attributes = True

class RideDetail(RideSummary):
    telemetry_blob: Optional[List[dict]] = None

class MapSegment(BaseModel):
    start: List[float]
    end: List[float]
    color: str
    speed: float
    segment_id: Optional[str] = None
    time_delta_vs_best_s: Optional[float] = None
    risk_score_0_100: Optional[int] = None

class GearAnalyticsPoint(BaseModel):
    gear: int
    time_seconds: float
    avg_rpm: float

class AnalysisMetrics(BaseModel):
    smoothness_score: Optional[int] = None
    efficiency_score: Optional[int] = None
    riding_style: Optional[str] = None
    ml_cluster_id: Optional[int] = None
    gear_analytics: Optional[List[GearAnalyticsPoint]] = None

class AnalysisEvent(BaseModel):
    type: str
    timestamp: str
    magnitude_mps2: float
    speed_kph: float

class Scorecards(BaseModel):
    smoothness_score: Optional[int] = None
    efficiency_score: Optional[int] = None
    consistency_score: Optional[int] = None
    risk_index: Optional[int] = None
    estimated_time_loss_s: Optional[float] = None

class SegmentAnalytics(BaseModel):
    segment_id: str
    start_idx: int
    end_idx: int
    entry_speed_kph: float
    apex_speed_kph: float
    exit_speed_kph: float
    braking_distance_m: float
    peak_decel_mps2: float
    throttle_delay_ms: int
    throttle_jerk_score: float
    time_delta_vs_best_s: float
    risk_score_0_100: int
    confidence_0_1: float
    primary_issue: str

class CoachingSummary(BaseModel):
    strengths: List[str]
    weaknesses: List[str]
    drills: List[str]
    llm_enhanced: Optional[bool] = None
    source: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    llm_note: Optional[str] = None

class RideAnalysisResponse(BaseModel):
    map_segments: List[MapSegment]
    max_speed: float
    metrics: AnalysisMetrics
    events: List[AnalysisEvent]
    scorecards: Optional[Scorecards] = None
    segment_analytics: Optional[List[SegmentAnalytics]] = None
    coaching: Optional[CoachingSummary] = None
    summary: str

class RideUpdate(BaseModel):
    title: Optional[str] = None


class RideVisibilityUpdate(BaseModel):
    visibility: str


class RideShareLinkCreate(BaseModel):
    expires_at: Optional[datetime] = None


class RideShareLinkOut(BaseModel):
    id: int
    ride_id: str
    token: str
    share_url: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FriendUserSummary(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    profile_picture_url: Optional[str] = None
    mutual_friends_count: Optional[int] = 0


class FriendRequestCreate(BaseModel):
    target_username: Optional[str] = None
    target_email: Optional[str] = None


class FriendRequestResponse(BaseModel):
    id: int
    status: str
    created_at: datetime
    responded_at: Optional[datetime] = None
    requester: FriendUserSummary
    receiver: FriendUserSummary


class FriendContactCandidate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None


class FriendRecommendation(BaseModel):
    user: FriendUserSummary
    reason: str
    from_contact_name: Optional[str] = None
    distance_km: Optional[float] = None


class FriendContactRecommendationRequest(BaseModel):
    contacts: List[FriendContactCandidate] = []
    limit: Optional[int] = 20


class FriendContactRecommendationResponse(BaseModel):
    from_contacts: List[FriendRecommendation]
    suggested_for_you: List[FriendRecommendation]


class FriendProfileStats(BaseModel):
    following_count: int = 0
    followers_count: int = 0
    shared_rides_count: int = 0


class FriendProfileResponse(BaseModel):
    user: FriendUserSummary
    stats: FriendProfileStats
    is_following: bool = False
    is_follower: bool = False
    can_view_rides: bool = False


class ChatHistoryTurn(BaseModel):
    role: str
    content: str
    timestamp: Optional[int] = None

class ChatRequest(BaseModel):
    prompt: str
    start_time_ms: int
    end_time_ms: int
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    api_key: Optional[str] = None
    low_quota_mode: Optional[bool] = False
    conversation_id: Optional[str] = None
    history: Optional[List[ChatHistoryTurn]] = None
    system_prompt: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    tools_used: Optional[List[str]] = None
    progress_updates: Optional[List[str]] = None


class LlmProviderOption(BaseModel):
    id: str
    label: str
    provider_type: str
    default_model: str
    models: List[str] = []
    reasoning_supported: bool = True


class LlmProvidersResponse(BaseModel):
    default_provider_id: str
    providers: List[LlmProviderOption]

class UserBase(BaseModel):
    email: str
    username: Optional[str] = None
    phone_number: Optional[str] = None

class UserCreate(UserBase):
    password: str
    full_name: Optional[str] = None

class User(UserBase):
    id: int
    full_name: Optional[str] = None
    profile_picture_url: Optional[str] = None
    last_known_lat: Optional[float] = None
    last_known_lng: Optional[float] = None
    last_location_label: Optional[str] = None
    last_location_updated_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    phone_number: Optional[str] = None


class UserLocationUpdate(BaseModel):
    lat: float
    lng: float
    label: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None


class UsernameAvailability(BaseModel):
    username: str
    normalized_username: str
    available: bool
    message: Optional[str] = None

class FavoriteBase(BaseModel):
    name: str
    lat: float
    lng: float

class FavoriteCreate(FavoriteBase):
    pass

class Favorite(FavoriteBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
    
    class Config:
        from_attributes = True

# Bike Schemas
class BikeBase(BaseModel):
    name: str
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    color: Optional[str] = "#dc0000"
    is_default: Optional[int] = 0
    image_url: Optional[str] = None

class BikeCreate(BikeBase):
    pass

class BikeUpdate(BaseModel):
    name: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    color: Optional[str] = None
    is_default: Optional[int] = None
    image_url: Optional[str] = None

class Bike(BikeBase):
    id: int
    owner_id: int
    
    class Config:
        from_attributes = True


class BikeDocumentBase(BaseModel):
    registration_number: Optional[str] = None
    chassis_number: Optional[str] = None
    engine_number: Optional[str] = None
    owner_name: Optional[str] = None

    driving_license_number: Optional[str] = None
    driving_license_expiry: Optional[str] = None
    driving_license_pdf_url: Optional[str] = None

    insurance_policy_number: Optional[str] = None
    insurance_expiry: Optional[str] = None
    insurance_pdf_url: Optional[str] = None

    pollution_certificate_number: Optional[str] = None
    pollution_expiry: Optional[str] = None
    pollution_pdf_url: Optional[str] = None

    registration_certificate_number: Optional[str] = None
    registration_expiry: Optional[str] = None
    registration_certificate_pdf_url: Optional[str] = None

    notes: Optional[str] = None


class BikeDocumentUpdate(BikeDocumentBase):
    pass


class BikeDocument(BikeDocumentBase):
    id: int
    bike_id: int

    class Config:
        from_attributes = True


class BikeDocumentUploadResponse(BaseModel):
    doc_type: str
    pdf_url: str
