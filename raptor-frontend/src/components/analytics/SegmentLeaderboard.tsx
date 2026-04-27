import React from 'react';

export interface SegmentAnalyticsItem {
    segment_id: string;
    entry_speed_kph: number;
    apex_speed_kph: number;
    exit_speed_kph: number;
    time_delta_vs_best_s: number;
    risk_score_0_100: number;
    confidence_0_1: number;
    primary_issue: string;
}

interface Props {
    segments: SegmentAnalyticsItem[];
}

const SegmentLeaderboard: React.FC<Props> = ({ segments }) => {
    if (!segments || segments.length === 0) {
        return <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1rem' }}>No segment analytics available for this ride.</p>;
    }

    const worstSegments = [...segments]
        .sort((a, b) => b.time_delta_vs_best_s - a.time_delta_vs_best_s)
        .slice(0, 5);

    return (
        <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: '0.96rem' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.84rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        <th style={{ textAlign: 'left', padding: '0.72rem 0.48rem' }}>Segment</th>
                        <th style={{ textAlign: 'left', padding: '0.72rem 0.48rem' }}>Delta</th>
                        <th style={{ textAlign: 'left', padding: '0.72rem 0.48rem' }}>Issue</th>
                        <th style={{ textAlign: 'left', padding: '0.72rem 0.48rem' }}>Risk</th>
                        <th style={{ textAlign: 'left', padding: '0.72rem 0.48rem' }}>Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    {worstSegments.map((segment) => (
                        <tr key={segment.segment_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <td style={{ padding: '0.72rem 0.48rem', color: 'var(--text-primary)', fontWeight: 700 }}>{segment.segment_id}</td>
                            <td style={{ padding: '0.72rem 0.48rem', color: '#ef4444', fontWeight: 700 }}>+{segment.time_delta_vs_best_s.toFixed(2)}s</td>
                            <td style={{ padding: '0.72rem 0.48rem', color: '#b9bec8', textTransform: 'capitalize' }}>
                                {segment.primary_issue.replace(/_/g, ' ')}
                            </td>
                            <td style={{ padding: '0.72rem 0.48rem', color: segment.risk_score_0_100 > 65 ? '#f97316' : '#b9bec8', fontWeight: 600 }}>
                                {segment.risk_score_0_100}
                            </td>
                            <td style={{ padding: '0.72rem 0.48rem', color: '#b9bec8' }}>
                                {(segment.confidence_0_1 * 100).toFixed(0)}%
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default SegmentLeaderboard;
