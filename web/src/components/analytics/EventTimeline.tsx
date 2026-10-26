import React from 'react';

interface EventData {
    type: string;
    timestamp: string;
    magnitude_mps2: number;
    speed_kph: number;
    lat?: number;
    lng?: number;
}

interface Props {
    events: EventData[];
    onEventClick?: (event: EventData) => void;
    selectedEventTimestamp?: string | null;
}

const EventTimeline: React.FC<Props> = ({
    events,
    onEventClick,
    selectedEventTimestamp
}) => {
    if (!events || events.length === 0) {
        return (
            <div className="empty-events" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                <p style={{ fontSize: '1rem', margin: 0 }}>Smooth riding! No harsh acceleration or braking events detected.</p>
            </div>
        );
    }

    // Sort by timestamp if not already sorted
    const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return (
        <div className="event-timeline" style={{ maxHeight: '460px', overflow: 'auto' }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: '96px 126px 116px 78px 104px',
                gap: '0.6rem',
                padding: '1rem 1rem 0.72rem 1rem',
                marginBottom: '0',
                color: 'var(--text-muted)',
                fontSize: '0.82rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                borderBottom: '1px solid var(--border-color)',
                position: 'sticky',
                top: 0,
                background: 'var(--bg-card)',
                zIndex: 10,
            }}>
                <div>Time</div>
                <div>Event</div>
                <div>Magnitude</div>
                <div>G</div>
                <div>Speed</div>
            </div>
            {sortedEvents.map((evt, idx) => {
                const isBrake_c = evt.type === 'hard_braking';
                const timeStr = new Date(evt.timestamp).toLocaleTimeString();
                const isSelected = selectedEventTimestamp === evt.timestamp;
                const gForce = Math.abs(evt.magnitude_mps2) / 9.81;

                return (
                    <div key={idx} style={{
                        display: 'grid',
                        gridTemplateColumns: '96px 126px 116px 78px 104px',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.9rem 1rem',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        background: isSelected
                            ? 'rgba(245, 158, 11, 0.16)'
                            : (isBrake_c ? 'rgba(255, 0, 0, 0.05)' : 'rgba(0, 150, 255, 0.05)'),
                        cursor: onEventClick ? 'pointer' : 'default',
                        transition: 'background 0.18s ease, box-shadow 0.18s ease',
                        boxShadow: isSelected ? 'inset 0 0 0 1px rgba(245, 158, 11, 0.65)' : 'none'
                    }}
                        onClick={() => onEventClick?.(evt)}>
                        <div style={{ color: '#aeb4bf', fontSize: '0.94rem' }}>
                            {timeStr}
                        </div>
                        <div style={{
                            fontWeight: 700,
                            fontSize: '0.98rem',
                            color: isBrake_c ? '#ff4444' : '#44aaff'
                        }}>
                            {isBrake_c ? 'Hard Brake' : 'Hard Accel'}
                        </div>
                        <div style={{ color: '#f3f4f6', fontSize: '0.96rem' }}>
                            {Math.abs(evt.magnitude_mps2).toFixed(2)} m/s²
                        </div>
                        <div style={{ color: '#facc15', fontSize: '0.92rem', fontWeight: 700 }}>
                            {gForce.toFixed(2)}g
                        </div>
                        <div style={{ color: '#d1d5db', fontSize: '0.93rem' }}>
                            {Number(evt.speed_kph || 0).toFixed(1)} km/h
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default EventTimeline;
