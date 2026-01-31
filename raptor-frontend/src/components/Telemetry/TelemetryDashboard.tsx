import React from 'react';
import { useSimulation } from '@/contexts/SimulationContext';
import TelemetryCard from './TelemetryCard';
import { formatTime } from '@/utils/formatters';
import './TelemetryDashboard.css';

const TelemetryDashboard: React.FC = () => {
    const { lapData, currentDataIndex } = useSimulation();

    const currentData = lapData[currentDataIndex] || {
        speed_kmph: 0,
        rpm: 0,
        throttle_percent: 0,
        lean_angle: 0,
        accel_x: 0,
        accel_y: 0,
        timestamp: 0,
    };

    const { speed_kmph, rpm, throttle_percent, lean_angle, accel_x, accel_y, timestamp } =
        currentData;

    // Calculate G-forces
    const gLateral = (accel_y / 9.81).toFixed(2);
    const gLongitudinal = (accel_x / 9.81).toFixed(2);

    // Lean angle percentage for visual indicator
    const leanPercent = ((lean_angle + 55) / 110) * 100;

    return (
        <section className="telemetry-section">
            <div className="section-header">
                <h2>Live Telemetry</h2>
            </div>

            <div className="telemetry-grid">
                {/* Speed */}
                <TelemetryCard
                    label="SPEED"
                    value={Math.round(speed_kmph)}
                    unit="km/h"
                    max={160}
                    className="primary"
                />

                {/* RPM */}
                <TelemetryCard
                    label="RPM"
                    value={Math.round(rpm)}
                    max={14000}
                    barColor="rpm"
                />

                {/* Throttle */}
                <TelemetryCard
                    label="THROTTLE"
                    value={Math.round(throttle_percent)}
                    unit="%"
                    max={100}
                    barColor="throttle"
                />

                {/* Lean Angle */}
                <div className="telemetry-card accent">
                    <div className="card-label">LEAN ANGLE</div>
                    <div className="card-value">
                        <span className="value">{lean_angle.toFixed(1)}</span>
                        <span className="unit">°</span>
                    </div>
                    <div className="lean-indicator">
                        <div className="lean-bar">
                            <div
                                className="lean-marker"
                                style={{ left: `${leanPercent}%` }}
                            />
                        </div>
                        <div className="lean-labels">
                            <span>L</span>
                            <span>0</span>
                            <span>R</span>
                        </div>
                    </div>
                </div>

                {/* G-Forces */}
                <div className="telemetry-card">
                    <div className="card-label">G-FORCES</div>
                    <div className="g-force-display">
                        <div className="g-item">
                            <span className="g-label">LAT</span>
                            <span className="g-value">{gLateral}</span>
                        </div>
                        <div className="g-item">
                            <span className="g-label">LONG</span>
                            <span className="g-value">{gLongitudinal}</span>
                        </div>
                    </div>
                </div>

                {/* Lap Time */}
                <div className="telemetry-card">
                    <div className="card-label">LAP TIME</div>
                    <div className="card-value time">
                        <span className="value">{formatTime(timestamp)}</span>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default TelemetryDashboard;
