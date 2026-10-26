import React from 'react';

interface CoachingData {
    strengths?: string[];
    weaknesses?: string[];
    drills?: string[];
    llm_enhanced?: boolean;
    source?: string;
    llm_provider?: string;
    llm_model?: string;
    llm_note?: string;
}

interface Props {
    coaching?: CoachingData;
}

const CoachingPanel: React.FC<Props> = ({ coaching }) => {
    const strengths = coaching?.strengths ?? [];
    const weaknesses = coaching?.weaknesses ?? [];
    const drills = coaching?.drills ?? [];
    const llmNote = (coaching?.llm_note || '').trim();
    const llmEnhanced = Boolean(coaching?.llm_enhanced);

    const hasData = strengths.length > 0 || weaknesses.length > 0 || drills.length > 0 || !!llmNote;

    if (!hasData) {
        return <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1rem' }}>Coaching insights will appear after analytics processing.</p>;
    }

    const sectionStyle: React.CSSProperties = {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: '0.95rem 1rem'
    };

    const headingStyle: React.CSSProperties = {
        margin: '0 0 0.62rem',
        fontSize: '0.92rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#d5d7df',
        fontWeight: 700
    };

    const listStyle: React.CSSProperties = {
        margin: 0,
        paddingLeft: '1.15rem',
        color: 'var(--text-secondary)',
        fontSize: '1rem',
        lineHeight: 1.55,
    };

    const listItemStyle: React.CSSProperties = {
        marginBottom: '0.5rem',
    };

    const noteStyle: React.CSSProperties = {
        border: llmEnhanced ? '1px solid rgba(220,0,0,0.45)' : '1px solid rgba(255,255,255,0.14)',
        borderRadius: 12,
        background: llmEnhanced
            ? 'linear-gradient(180deg, rgba(220,0,0,0.12), rgba(220,0,0,0.04))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
        padding: '0.82rem 0.95rem',
        display: 'grid',
        gap: '0.35rem',
    };

    return (
        <div style={{ display: 'grid', gap: '0.9rem' }}>
            {llmNote && (
                <div style={noteStyle}>
                    <div
                        style={{
                            color: llmEnhanced ? '#fecaca' : '#d5d7df',
                            fontSize: '0.82rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                        }}
                    >
                        {llmEnhanced ? 'Insight Source: LLM Enhanced' : 'Insight Source: Rule Engine'}
                        {coaching?.llm_provider ? ` (${coaching.llm_provider}` : ''}
                        {coaching?.llm_model ? ` / ${coaching.llm_model})` : coaching?.llm_provider ? ')' : ''}
                    </div>
                    <p style={{ margin: 0, color: '#e5e7eb', fontSize: '0.95rem', lineHeight: 1.45 }}>{llmNote}</p>
                </div>
            )}

            <div style={sectionStyle}>
                <h4 style={headingStyle}>Strengths</h4>
                <ul style={listStyle}>
                    {strengths.map((item, idx) => <li key={`s-${idx}`} style={listItemStyle}>{item}</li>)}
                </ul>
            </div>

            <div style={sectionStyle}>
                <h4 style={headingStyle}>Weaknesses</h4>
                <ul style={listStyle}>
                    {weaknesses.map((item, idx) => <li key={`w-${idx}`} style={listItemStyle}>{item}</li>)}
                </ul>
            </div>

            <div style={sectionStyle}>
                <h4 style={headingStyle}>Recommended Drills</h4>
                <ul style={listStyle}>
                    {drills.map((item, idx) => <li key={`d-${idx}`} style={listItemStyle}>{item}</li>)}
                </ul>
            </div>
        </div>
    );
};

export default CoachingPanel;
