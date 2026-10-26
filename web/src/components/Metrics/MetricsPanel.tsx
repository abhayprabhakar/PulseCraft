import React from 'react';
import { useSimulation } from '@/contexts/SimulationContext';
import './MetricsPanel.css';

const MetricsPanel: React.FC = () => {
    const { lapMetrics } = useSimulation();

    return (
        <section className="metrics-section">
            <div className="section-header">
                <h2>Performance Metrics</h2>
            </div>
            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-label">Throttle Smoothness</div>
                    <div className="metric-value">
                        {lapMetrics?.throttle_smoothness_index.toFixed(2) || '--'}
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Max Speed</div>
                    <div className="metric-value">
                        {lapMetrics ? `${lapMetrics.max_speed_kmph.toFixed(1)} km/h` : '--'}
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Max Lean</div>
                    <div className="metric-value">
                        {lapMetrics ? `${lapMetrics.max_lean_deg.toFixed(1)}°` : '--'}
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Lateral Accel RMS</div>
                    <div className="metric-value">
                        {lapMetrics?.lateral_accel_rms.toFixed(3) || '--'}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default MetricsPanel;
