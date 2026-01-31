import React, { useState } from 'react';
import { useSimulation } from '@/contexts/SimulationContext';
import './PlaybackControls.css';

const PlaybackControls: React.FC = () => {
    const {
        playbackState,
        playbackSpeed: currentSpeed,
        play,
        pause,
        reset,
        setPlaybackSpeed,
        seekToIndex,
        lapData,
        currentDataIndex,
        exportData,
    } = useSimulation();

    const [exporting, setExporting] = useState(false);

    const speeds = [0.5, 1, 2, 3];
    const progress = lapData.length > 0 ? (currentDataIndex / lapData.length) * 100 : 0;

    const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value);
        const index = Math.floor((value / 100) * lapData.length);
        seekToIndex(index);
    };

    const handleExport = async (format: 'csv' | 'json') => {
        setExporting(true);
        try {
            await exportData(format);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="controls-panel">
            <div className="playback-controls">
                <button className="control-btn" onClick={reset} title="Reset">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 9 9 9 9 0 0 1-9 9 9 9 0 0 1-9-9z" />
                        <path d="M12 7v5l3 3" />
                    </svg>
                </button>

                <button
                    className="control-btn primary"
                    onClick={playbackState === 'playing' ? pause : play}
                    title={playbackState === 'playing' ? 'Pause' : 'Play'}
                >
                    {playbackState === 'playing' ? (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 4h4v16H6z" />
                            <path d="M14 4h4v16h-4z" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    )}
                </button>

                <div className="speed-control">
                    {speeds.map((speed) => (
                        <button
                            key={speed}
                            className={`speed-btn ${currentSpeed === speed ? 'active' : ''}`}
                            onClick={() => setPlaybackSpeed(speed)}
                        >
                            {speed}x
                        </button>
                    ))}
                </div>
            </div>

            <div className="progress-container">
                <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={progress}
                        step="0.1"
                        onChange={handleProgressChange}
                    />
                </div>
            </div>

            <div className="export-controls">
                <button
                    className="export-btn"
                    onClick={() => handleExport('csv')}
                    disabled={exporting}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export CSV
                </button>
                <button
                    className="export-btn"
                    onClick={() => handleExport('json')}
                    disabled={exporting}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export JSON
                </button>
            </div>
        </div>
    );
};

export default PlaybackControls;
