import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

interface GearData {
    gear: number;
    time_seconds: number;
    avg_rpm: number;
}

interface Props {
    data: GearData[];
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#00c49f'];

const GearUsageChart: React.FC<Props> = ({ data }) => {
    if (!data || data.length === 0) return <p>No gear data available.</p>;

    return (
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis dataKey="gear" stroke="#888" tickFormatter={(val) => `Gear ${val}`} />
                    <YAxis label={{ value: 'Time (s)', angle: -90, position: 'insideLeft', fill: '#888' }} stroke="#888" />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#222', borderColor: '#444' }}
                        formatter={(value: any, name?: string) => {
                            if (name === 'time_seconds') return [`${Number(value).toFixed(1)}s`, 'Time Selected'];
                            return [value, name];
                        }}
                        labelFormatter={(label) => `Gear ${label}`}
                    />
                    <Bar dataKey="time_seconds" name="Time in Gear">
                        {data.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default GearUsageChart;
