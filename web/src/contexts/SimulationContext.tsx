import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { SensorData, LapMetrics, PlaybackState } from '@/types/simulation';
import simulationService from '@/services/simulationService';

interface SimulationContextType {
    // Data
    lapData: SensorData[];
    lapMetrics: LapMetrics | null;
    currentDataIndex: number;
    currentLapId: number;
    totalLaps: number;

    // Playback state
    playbackState: PlaybackState;
    playbackSpeed: number;

    // API status
    isLoading: boolean;
    error: string | null;
    apiConnected: boolean;

    // Actions
    loadLap: (lapId: number) => Promise<void>;
    play: () => void;
    pause: () => void;
    reset: () => void;
    setPlaybackSpeed: (speed: number) => void;
    seekToIndex: (index: number) => void;
    exportData: (format: 'csv' | 'json') => Promise<void>;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lapData, setLapData] = useState<SensorData[]>([]);
    const [lapMetrics, setLapMetrics] = useState<LapMetrics | null>(null);
    const [currentDataIndex, setCurrentDataIndex] = useState(0);
    const [currentLapId, setCurrentLapId] = useState(1);
    const [totalLaps] = useState(3);

    const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
    const [playbackSpeed, setPlaybackSpeedState] = useState(1);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apiConnected, setApiConnected] = useState(false);

    // Load lap data from API
    const loadLap = useCallback(async (lapId: number) => {
        setIsLoading(true);
        setError(null);

        try {
            const [dataResponse, metricsResponse] = await Promise.all([
                simulationService.getLapData(lapId),
                simulationService.getLapMetrics(lapId),
            ]);

            setLapData(dataResponse.data);
            setLapMetrics(metricsResponse.metrics);
            setCurrentLapId(lapId);
            setCurrentDataIndex(0);
            setApiConnected(true);
        } catch (err) {
            setError('Failed to load lap data. Make sure the API server is running.');
            setApiConnected(false);
            console.error('Failed to load lap:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Playback controls
    const play = useCallback(() => {
        if (lapData.length > 0) {
            setPlaybackState('playing');
        }
    }, [lapData.length]);

    const pause = useCallback(() => {
        setPlaybackState('paused');
    }, []);

    const reset = useCallback(() => {
        setPlaybackState('stopped');
        setCurrentDataIndex(0);
    }, []);

    const setPlaybackSpeed = useCallback((speed: number) => {
        setPlaybackSpeedState(speed);
    }, []);

    const seekToIndex = useCallback((index: number) => {
        setCurrentDataIndex(Math.min(Math.max(0, index), lapData.length - 1));
    }, [lapData.length]);

    // Export data
    const exportData = useCallback(async (format: 'csv' | 'json') => {
        try {
            const blob = format === 'csv'
                ? await simulationService.exportCSV(currentLapId)
                : await simulationService.exportJSON(currentLapId);

            const filename = `raptor_lap_${currentLapId}.${format}`;
            simulationService.downloadFile(blob, filename);
        } catch (err) {
            setError(`Failed to export ${format.toUpperCase()}`);
            console.error('Export error:', err);
        }
    }, [currentLapId]);

    // Animation loop
    useEffect(() => {
        if (playbackState !== 'playing' || lapData.length === 0) return;

        const interval = setInterval(() => {
            setCurrentDataIndex((prev) => {
                const next = prev + 1;
                if (next >= lapData.length) {
                    setPlaybackState('stopped');
                    return 0;
                }
                return next;
            });
        }, 20 / playbackSpeed); // 50Hz base rate

        return () => clearInterval(interval);
    }, [playbackState, playbackSpeed, lapData.length]);

    // Load initial data
    useEffect(() => {
        loadLap(1);
    }, [loadLap]);

    const value: SimulationContextType = {
        lapData,
        lapMetrics,
        currentDataIndex,
        currentLapId,
        totalLaps,
        playbackState,
        playbackSpeed,
        isLoading,
        error,
        apiConnected,
        loadLap,
        play,
        pause,
        reset,
        setPlaybackSpeed,
        seekToIndex,
        exportData,
    };

    return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
};

export const useSimulation = (): SimulationContextType => {
    const context = useContext(SimulationContext);
    if (!context) {
        throw new Error('useSimulation must be used within SimulationProvider');
    }
    return context;
};
