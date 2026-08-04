import axios from 'axios';

// Use environment variable or default to localhost
// Check localStorage for saved URL
const SAVED_API_URL = localStorage.getItem('api_url');
const API_URL = SAVED_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const setBaseUrl = (url: string) => {
    localStorage.setItem('api_url', url);
    api.defaults.baseURL = url;
};

export const checkConnection = async (url?: string): Promise<boolean> => {
    try {
        const targetUrl = url || api.defaults.baseURL || '';
        // Try hitting root or a safe endpoint
        // Using fetch to avoid axios interceptors for this simple check if needed,
        // but axios is fine. We just want to check connectivity.
        await axios.get(targetUrl + '/', { timeout: 3000 });
        return true;
    } catch (e) {
        return false;
    }
};

// Add a request interceptor to include the token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error?.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('currentBike');

            const currentPath = window.location.pathname;
            if (currentPath !== '/signin' && currentPath !== '/signup') {
                window.location.assign('/signin');
            }
        }

        return Promise.reject(error);
    }
);

import { User, UserStats } from '../types/user';

// ... (existing code)

export const authApi = {
    login: async (username: string, password: string): Promise<{ access_token: string, token_type: string }> => {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        const response = await api.post('/api/v1/auth/login', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data;
    },
    register: async (user: any): Promise<User> => {
        const response = await api.post('/api/v1/auth/register', user);
        return response.data;
    },
    getProfile: async (): Promise<User> => {
        const response = await api.get('/api/v1/auth/me');
        return response.data;
    },
    resetPassword: async (identifier: string, new_password: string): Promise<{message: string}> => {
        const response = await api.post('/api/v1/auth/reset-password', { identifier, new_password });
        return response.data;
    },
    updateProfile: async (data: { full_name?: string; email?: string }): Promise<User> => {
        const response = await api.put('/api/v1/auth/me', data);
        return response.data;
    },
    uploadAvatar: async (file: File): Promise<User> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/api/v1/auth/users/me/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' } // axios sets boundary automatically
        });
        return response.data;
    },
    getStats: async (): Promise<UserStats> => {
        const response = await api.get('/api/v1/auth/users/me/stats');
        return response.data;
    },
    deleteAccount: async (): Promise<void> => {
        await api.delete('/api/v1/auth/me');
    }
};

export interface RideSummary {
    id: string;
    title: string;
    started_at: string;
    duration_seconds: number;
    max_speed: number;
    avg_speed: number;
    max_lean_left?: number;
    max_lean_right?: number;
    max_rpm?: number;
    total_distance_km: number;
    bike_id?: number;
}

export interface RideAnalysis {
    map_segments: Array<{
        start: number[];
        end: number[];
        color: string;
        speed: number;
        segment_id?: string;
        time_delta_vs_best_s?: number;
        risk_score_0_100?: number;
    }>;
    max_speed: number;
    metrics: {
        smoothness_score?: number;
        efficiency_score?: number;
        riding_style?: string;
        ml_cluster_id?: number;
        gear_analytics?: Array<{
            gear: number;
            time_seconds: number;
            avg_rpm: number;
        }>;
    };
    events?: Array<{
        type: string;
        timestamp: string;
        magnitude_mps2: number;
        speed_kph: number;
    }>;
    scorecards?: {
        smoothness_score?: number;
        efficiency_score?: number;
        consistency_score?: number;
        risk_index?: number;
        estimated_time_loss_s?: number;
    };
    segment_analytics?: Array<{
        segment_id: string;
        start_idx: number;
        end_idx: number;
        entry_speed_kph: number;
        apex_speed_kph: number;
        exit_speed_kph: number;
        braking_distance_m: number;
        peak_decel_mps2: number;
        throttle_delay_ms: number;
        throttle_jerk_score: number;
        time_delta_vs_best_s: number;
        risk_score_0_100: number;
        confidence_0_1: number;
        primary_issue: string;
    }>;
    coaching?: {
        strengths: string[];
        weaknesses: string[];
        drills: string[];
        llm_enhanced?: boolean;
        source?: string;
        llm_provider?: string;
        llm_model?: string;
        llm_note?: string;
    };
    summary: string;
}

export interface TelemetryChatResponse {
    answer: string;
    tools_used?: string[];
    progress_updates?: string[];
}

export interface TelemetryChatHistoryTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
}

export interface TelemetryChatRequest {
    prompt: string;
    start_time_ms: number;
    end_time_ms: number;
    llm_provider?: string;
    llm_model?: string;
    api_key?: string;
    low_quota_mode?: boolean;
    conversation_id?: string;
    history?: TelemetryChatHistoryTurn[];
    system_prompt?: string;
}

export interface AiPersona {
    id: string;
    name: string;
    rolePrompt: string;
    providerId: string;
    modelId: string;
    apiKey: string;
}

export interface LlmProviderOption {
    id: string;
    label: string;
    provider_type: string;
    default_model: string;
    models: string[];
    reasoning_supported: boolean;
}

export interface LlmProvidersResponse {
    default_provider_id: string;
    providers: LlmProviderOption[];
}

export interface TelemetryChatErrorInfo {
    code?: string;
    user_message?: string;
    provider?: string;
    model?: string;
    retry_after_seconds?: number;
    raw_error?: string;
    status?: number;
}

function toUserFriendlyChatError(error: any): Error & { info?: TelemetryChatErrorInfo } {
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail;

    let message = error?.message || 'Failed to analyze telemetry.';
    let info: TelemetryChatErrorInfo | undefined;

    if (typeof detail === 'string') {
        message = detail;
    } else if (detail && typeof detail === 'object') {
        info = {
            code: detail.code,
            user_message: detail.user_message,
            provider: detail.provider,
            model: detail.model,
            retry_after_seconds: detail.retry_after_seconds,
            raw_error: detail.raw_error,
            status,
        };

        message = detail.user_message || message;
        if (detail.retry_after_seconds) {
            message = `${message} Retry in ~${detail.retry_after_seconds}s.`;
        }
    } else if (status === 429) {
        message = 'LLM rate limit reached. Please wait a bit and try again, or switch model/provider.';
    }

    const wrapped = new Error(message) as Error & { info?: TelemetryChatErrorInfo };
    wrapped.info = info;
    return wrapped;
}

import {
    Bike,
    BikeCreate,
    BikeUpdate,
    BikeDocumentProfile,
    BikeDocumentType,
    BikeDocumentUpdate,
    BikeDocumentUploadResponse
} from '../types/bike';

export const ridesApi = {
    list: async (bikeId?: number): Promise<RideSummary[]> => {
        const params = bikeId ? { bike_id: bikeId } : {};
        const response = await api.get('/api/v1/rides/', { params });
        return response.data;
    },

    getAnalysis: async (rideId: string, options?: { forceRefresh?: boolean }): Promise<RideAnalysis> => {
        const params = options?.forceRefresh ? { force_refresh: true } : {};
        const response = await api.get(`/api/v1/rides/${rideId}/analysis`, { params });
        return response.data;
    },

    getDetail: async (rideId: string) => {
        const response = await api.get(`/api/v1/rides/${rideId}`);
        return response.data;
    },

    chatWithTelemetry: async (rideId: string, payload: TelemetryChatRequest): Promise<TelemetryChatResponse> => {
        try {
            const response = await api.post(`/api/v1/rides/${rideId}/chat`, payload);
            return response.data;
        } catch (error: any) {
            throw toUserFriendlyChatError(error);
        }
    },

    getLlmProviders: async (): Promise<LlmProvidersResponse> => {
        const response = await api.get('/api/v1/rides/llm/providers');
        return response.data;
    },

    deleteRide: async (rideId: string) => {
        await api.delete(`/api/v1/rides/${rideId}`);
    },

    updateTitle: async (rideId: string, title: string) => {
        const response = await api.put(`/api/v1/rides/${rideId}`, { title });
        return response.data;
    },

    uploadCsv: async (file: File, bikeId?: number) => {
        const params = bikeId ? { bike_id: bikeId } : {};
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/api/v1/rides/upload_csv', formData, {
            params,
            headers: {
                'Content-Type': undefined,
            } as any,
        });
        return response.data;
    }
};

export const bikesApi = {
    list: async (): Promise<Bike[]> => {
        const response = await api.get('/api/v1/bikes/');
        return response.data;
    },
    create: async (data: BikeCreate): Promise<Bike> => {
        const response = await api.post('/api/v1/bikes/', data);
        return response.data;
    },
    update: async (id: number, data: BikeUpdate): Promise<Bike> => {
        const response = await api.put(`/api/v1/bikes/${id}`, data);
        return response.data;
    },
    delete: async (id: number): Promise<void> => {
        await api.delete(`/api/v1/bikes/${id}`);
    },
    uploadImage: async (id: number, file: File): Promise<Bike> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post(`/api/v1/bikes/${id}/image`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    getDocuments: async (id: number): Promise<BikeDocumentProfile> => {
        const response = await api.get(`/api/v1/bikes/${id}/documents`);
        return response.data;
    },
    updateDocuments: async (id: number, data: BikeDocumentUpdate): Promise<BikeDocumentProfile> => {
        const response = await api.put(`/api/v1/bikes/${id}/documents`, data);
        return response.data;
    },
    uploadDocumentPdf: async (id: number, docType: BikeDocumentType, file: File): Promise<BikeDocumentUploadResponse> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post(`/api/v1/bikes/${id}/documents/${docType}/pdf`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    }
};

export default api;
