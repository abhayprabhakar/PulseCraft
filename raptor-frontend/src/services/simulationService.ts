import api from './api';
import {
    SimulationDataResponse,
    LapMetricsResponse,
    SessionSummary,
} from '@/types/simulation';

class SimulationService {
    /**
     * Get sensor data for a specific lap
     */
    async getLapData(lapId: number): Promise<SimulationDataResponse> {
        const response = await api.get(`/api/simulation/data`, {
            params: { lap_id: lapId },
        });
        return response.data;
    }

    /**
     * Get performance metrics for a specific lap
     */
    async getLapMetrics(lapId: number): Promise<LapMetricsResponse> {
        const response = await api.get(`/api/lap/${lapId}/metrics`);
        return response.data;
    }

    /**
     * Get session summary with all laps
     */
    async getSessionSummary(): Promise<SessionSummary> {
        const response = await api.get('/api/session/summary');
        return response.data;
    }

    /**
     * Export lap data as CSV
     */
    async exportCSV(lapId?: number): Promise<Blob> {
        const response = await api.post(
            '/api/export/csv',
            {},
            {
                params: lapId ? { lap_id: lapId } : {},
                responseType: 'blob',
            }
        );
        return response.data;
    }

    /**
     * Export lap data as JSON
     */
    async exportJSON(lapId?: number): Promise<Blob> {
        const response = await api.post(
            '/api/export/json',
            {},
            {
                params: lapId ? { lap_id: lapId } : {},
                responseType: 'blob',
            }
        );
        return response.data;
    }

    /**
     * Download file helper
     */
    downloadFile(blob: Blob, filename: string): void {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }
}

export default new SimulationService();
