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
        return <p style={{ color: 'var(--text-muted)', margin: 0 }}>No segment analytics available for this ride.</p>;
    }

    const worstSegments = [...segments]
        .sort((a, b) => b.time_delta_vs_best_s - a.time_delta_vs_best_s)
        .slice(0, 5);

    return (
        <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.4rem' }}>Segment</th>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.4rem' }}>Delta</th>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.4rem' }}>Issue</th>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.4rem' }}>Risk</th>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.4rem' }}>Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    {worstSegments.map((segment) => (
                        <tr key={segment.segment_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <td style={{ padding: '0.55rem 0.4rem', color: 'var(--text-primary)', fontWeight: 600 }}>{segment.segment_id}</td>
                            <td style={{ padding: '0.55rem 0.4rem', color: '#ef4444' }}>+{segment.time_delta_vs_best_s.toFixed(2)}s</td>
                            <td style={{ padding: '0.55rem 0.4rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                {segment.primary_issue.replace(/_/g, ' ')}
                            </td>
                            <td style={{ padding: '0.55rem 0.4rem', color: segment.risk_score_0_100 > 65 ? '#f97316' : 'var(--text-muted)' }}>
                                {segment.risk_score_0_100}
                            </td>
                            <td style={{ padding: '0.55rem 0.4rem', color: 'var(--text-muted)' }}>
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
