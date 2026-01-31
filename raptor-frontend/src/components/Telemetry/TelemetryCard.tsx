import React from 'react';
import { useSimulation } from '@/contexts/SimulationContext';
import { formatNumber } from '@/utils/formatters';
import './TelemetryCard.css';

interface TelemetryCardProps {
    label: string;
    value: number | string;
    unit?: string;
    max?: number;
    barColor?: string;
    className?: string;
}

const TelemetryCard: React.FC<TelemetryCardProps> = ({
    label,
    value,
    unit,
    max,
    barColor,
    className = '',
}) => {
    const numValue = typeof value === 'number' ? value : 0;
    const percentage = max ? (numValue / max) * 100 : 0;

    return (
        <div className={`telemetry-card ${className}`}>
            <div className="card-label">{label}</div>
            <div className="card-value">
                <span className="value">
                    {typeof value === 'number' ? formatNumber(value) : value}
                </span>
                {unit && <span className="unit">{unit}</span>}
            </div>
            {max !== undefined && (
                <div className="card-bar">
                    <div
                        className={`bar-fill ${barColor || ''}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                </div>
            )}
        </div>
    );
};

export default TelemetryCard;
