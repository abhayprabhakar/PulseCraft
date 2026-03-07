import React from 'react';

interface CoachingData {
    strengths?: string[];
    weaknesses?: string[];
    drills?: string[];
}

interface Props {
    coaching?: CoachingData;
}

const CoachingPanel: React.FC<Props> = ({ coaching }) => {
    const strengths = coaching?.strengths ?? [];
    const weaknesses = coaching?.weaknesses ?? [];
    const drills = coaching?.drills ?? [];

    const hasData = strengths.length > 0 || weaknesses.length > 0 || drills.length > 0;

    if (!hasData) {
        return <p style={{ color: 'var(--text-muted)', margin: 0 }}>Coaching insights will appear after analytics processing.</p>;
    }

    const sectionStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border-color)',
        borderRadius: 10,
        padding: '0.75rem 0.85rem'
    };

    const headingStyle: React.CSSProperties = {
        margin: '0 0 0.5rem',
        fontSize: '0.78rem',
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)'
    };

    return (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={sectionStyle}>
                <h4 style={headingStyle}>Strengths</h4>
                <ul style={{ margin: 0, paddingLeft: '1rem', color: 'var(--text-muted)' }}>
                    {strengths.map((item, idx) => <li key={`s-${idx}`} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                </ul>
            </div>

            <div style={sectionStyle}>
                <h4 style={headingStyle}>Weaknesses</h4>
                <ul style={{ margin: 0, paddingLeft: '1rem', color: 'var(--text-muted)' }}>
                    {weaknesses.map((item, idx) => <li key={`w-${idx}`} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                </ul>
            </div>

            <div style={sectionStyle}>
                <h4 style={headingStyle}>Recommended Drills</h4>
                <ul style={{ margin: 0, paddingLeft: '1rem', color: 'var(--text-muted)' }}>
                    {drills.map((item, idx) => <li key={`d-${idx}`} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                </ul>
            </div>
        </div>
    );
};

export default CoachingPanel;
