import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

interface GearData {
    gear: number;
    time_seconds: number;
    avg_rpm: number;
}

interface Props {
    data: GearData[];
}

type GearTooltipProps = {
    active?: boolean;
    payload?: Array<{
        value?: number | string;
        payload?: GearData;
    }>;
    label?: string | number;
};

const BAR_COLORS = ['#7a6ff0', '#63c694', '#f7be58', '#ff8f38', '#2c90f2', '#1fc9ab', '#ff5a5a'];

const GearTooltip: React.FC<GearTooltipProps> = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const entry = payload[0];
    const seconds = Number(entry.value ?? 0);
    const rpm = Number(entry.payload?.avg_rpm ?? 0);

    return (
        <div
            style={{
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'linear-gradient(165deg, rgba(15,17,23,0.98), rgba(9,10,14,0.98))',
                boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                padding: '0.6rem 0.72rem',
                minWidth: 152,
            }}
        >
            <div
                style={{
                    color: '#f4f5f7',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: '0.88rem',
                    letterSpacing: '0.05em',
                    marginBottom: '0.35rem',
                }}
            >
                Gear {label}
            </div>
            <div style={{ color: '#d9dee8', fontSize: '0.92rem', lineHeight: 1.45 }}>
                <strong style={{ color: '#ffffff', fontWeight: 700 }}>Time in Gear:</strong> {seconds.toFixed(1)}s
            </div>
            <div style={{ color: '#d9dee8', fontSize: '0.92rem', lineHeight: 1.45 }}>
                <strong style={{ color: '#ffffff', fontWeight: 700 }}>Avg RPM:</strong> {rpm.toFixed(0)}
            </div>
        </div>
    );
};

const GearUsageChart: React.FC<Props> = ({ data }) => {
    if (!data || data.length === 0) return <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem' }}>No gear data available.</p>;

    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => a.gear - b.gear);
    }, [data]);

    const totalTime = useMemo(() => {
        return sortedData.reduce((sum, item) => sum + Number(item.time_seconds || 0), 0);
    }, [sortedData]);

    const dominantGear = useMemo(() => {
        return sortedData.reduce<GearData | null>((best, current) => {
            if (!best) return current;
            return current.time_seconds > best.time_seconds ? current : best;
        }, null);
    }, [sortedData]);

    const weightedAvgRpm = useMemo(() => {
        if (totalTime <= 0) return 0;
        const weighted = sortedData.reduce((sum, item) => sum + item.avg_rpm * item.time_seconds, 0);
        return weighted / totalTime;
    }, [sortedData, totalTime]);

    return (
        <div style={{ width: '100%', display: 'grid', gap: '0.85rem' }}>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: '0.55rem',
                }}
            >
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'rgba(255,255,255,0.03)', padding: '0.5rem 0.65rem' }}>
                    <div style={{ color: '#aeb4bf', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Time</div>
                    <div style={{ color: '#f8fafc', fontSize: '1.02rem', fontFamily: 'Orbitron, sans-serif' }}>{totalTime.toFixed(1)}s</div>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'rgba(255,255,255,0.03)', padding: '0.5rem 0.65rem' }}>
                    <div style={{ color: '#aeb4bf', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dominant Gear</div>
                    <div style={{ color: '#f8fafc', fontSize: '1.02rem', fontFamily: 'Orbitron, sans-serif' }}>
                        {dominantGear ? `Gear ${dominantGear.gear}` : 'N/A'}
                    </div>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'rgba(255,255,255,0.03)', padding: '0.5rem 0.65rem' }}>
                    <div style={{ color: '#aeb4bf', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Weighted RPM</div>
                    <div style={{ color: '#f8fafc', fontSize: '1.02rem', fontFamily: 'Orbitron, sans-serif' }}>{weightedAvgRpm.toFixed(0)}</div>
                </div>
            </div>

            <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                    <BarChart data={sortedData} margin={{ top: 10, right: 12, left: 6, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.14)" vertical={false} />
                        <XAxis
                            dataKey="gear"
                            axisLine={{ stroke: 'rgba(255,255,255,0.16)' }}
                            tickLine={false}
                            tick={{ fill: '#c2c8d3', fontSize: 13, fontFamily: 'Rajdhani, sans-serif', fontWeight: 700 }}
                            tickFormatter={(val) => `Gear ${val}`}
                        />
                        <YAxis
                            axisLine={{ stroke: 'rgba(255,255,255,0.16)' }}
                            tickLine={false}
                            stroke="#9aa0aa"
                            tick={{ fill: '#c2c8d3', fontSize: 13, fontFamily: 'Rajdhani, sans-serif' }}
                            label={{ value: 'Time (s)', angle: -90, position: 'insideLeft', fill: '#c2c8d3', fontSize: 13, fontFamily: 'Rajdhani, sans-serif' }}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(220, 0, 0, 0.12)', stroke: 'rgba(220, 0, 0, 0.45)', strokeWidth: 1 }}
                            content={<GearTooltip />}
                        />
                        <Bar
                            dataKey="time_seconds"
                            name="Time in Gear"
                            barSize={36}
                            radius={[8, 8, 2, 2]}
                            activeBar={{ fill: '#ff5a5a', stroke: '#ffd2d2', strokeWidth: 1, radius: [8, 8, 2, 2] as any }}
                        >
                            {sortedData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default GearUsageChart;
