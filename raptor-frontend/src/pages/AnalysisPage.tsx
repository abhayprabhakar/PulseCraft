import React, { useEffect, useState } from 'react';
import { ridesApi, RideAnalysis } from '../services/api';
import { Activity, Zap, Shield, Map as MapIcon, Gauge, AlertTriangle } from 'lucide-react';
import AnalysisMap from '../components/Map/AnalysisMap';
import GearUsageChart from '../components/analytics/GearUsageChart';
import EventTimeline from '../components/analytics/EventTimeline';
import SegmentLeaderboard from '../components/analytics/SegmentLeaderboard';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AnalysisPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { currentBike } = useAuth();
    const [analysis, setAnalysis] = useState<RideAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [focusedPoint, setFocusedPoint] = useState<[number, number] | null>(null);
    const [selectedEventTimestamp, setSelectedEventTimestamp] = useState<string | null>(null);

    const [showRawData, setShowRawData] = useState(false);
    const [rawData, setRawData] = useState<any[] | null>(null);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                let rideId = id;

                if (!rideId) {
                    // Fetch latest ride if no ID provided
                    if (currentBike) {
                        const rides = await ridesApi.list(currentBike.id);
                        if (rides.length > 0) {
                            rideId = rides[0].id; // Assuming sorted desc by backend
                        }
                    }
                }

                if (rideId) {
                    const data = await ridesApi.getAnalysis(rideId);
                    setAnalysis(data);
                } else {
                    setError("No rides found.");
                }
            } catch (err) {
                console.error("Failed to load analysis", err);
                setError("Failed to load analysis data.");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id, currentBike]);

    if (loading) return <div>Loading Analytics...</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!analysis) return <div>No ride data found. Please record a ride in the app.</div>;

    const metrics = analysis.metrics;
    const events = analysis.events || [];
    const segmentAnalytics = analysis.segment_analytics || [];

    const handleViewRawData = async () => {
        if (!id) return;
        setShowRawData(true);
        if (!rawData) {
            try {
                const detail = await ridesApi.getDetail(id);
                if (detail && detail.telemetry_blob) {
                    setRawData(detail.telemetry_blob);
                } else {
                    setRawData([]);
                }
            } catch (error) {
                console.error("Failed to load raw data", error);
                alert("Failed to load raw data");
            }
        }
    };

    const downloadJson = () => {
        if (!rawData) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rawData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "ride_data.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    return (
        <div className="analysis-page">
            <div className="page-header">
                <h2>Advanced Telemetry Analytics</h2>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        className="btn-header"
                        onClick={() => navigate(`/rides/${id}?tab=timeseries`, { state: { initialTab: 'timeseries' } })}
                        style={{ background: 'var(--accent-primary)', color: 'white', border: 'none' }}
                    >
                        <Zap size={16} style={{ display: 'inline', marginRight: '6px' }} />
                        Time Series AI
                    </button>
                    <button className="btn-header btn-raw-data" onClick={handleViewRawData}>
                        View Raw Data
                    </button>
                </div>
            </div>

            <div className="metrics-grid">
                <div className="stat-card">
                    <div className="icon-box blue"><Shield /></div>
                    <h3>Smoothness Score</h3>
                    <div className="stat-value">{metrics.smoothness_score ?? '-'} <span className="stat-unit">/100</span></div>
                    <p className="stat-desc">Based on speed and throttle variance.</p>
                </div>
                <div className="stat-card">
                    <div className="icon-box green"><Zap /></div>
                    <h3>Efficiency Score</h3>
                    <div className="stat-value">{metrics.efficiency_score ?? '-'} <span className="stat-unit">/100</span></div>
                    <p className="stat-desc">Engine payload optimization proxy.</p>
                </div>
                <div className="stat-card">
                    <div className="icon-box purple"><Activity /></div>
                    <h3>Riding Style</h3>
                    <div className="stat-value">{metrics.riding_style || 'Unknown'}</div>
                    <p className="stat-desc">AI classified riding behaviour.</p>
                </div>
                <div className="stat-card">
                    <div className="icon-box orange"><AlertTriangle /></div>
                    <h3>Critical Events</h3>
                    <div className="stat-value">{events.length} <span className="stat-unit">events</span></div>
                    <p className="stat-desc">Hard accels & heavy braking.</p>
                </div>
            </div>

            <div className="charts-container">
                <div className="chart-card map-card">
                    <div className="card-header">
                        <MapIcon className="icon" size={20} />
                        <h3>Track Map (Speed Gradient)</h3>
                    </div>
                    <AnalysisMap segments={analysis.map_segments || []} focusedPoint={focusedPoint} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="chart-card">
                        <div className="card-header">
                            <Activity className="icon" size={20} />
                            <h3>Event Timeline</h3>
                        </div>
                        <EventTimeline
                            events={events}
                            onEventClick={(evt) => {
                                if (evt.lat && evt.lng) {
                                    setFocusedPoint([evt.lat, evt.lng]);
                                } else {
                                    setFocusedPoint(null);
                                }
                                setSelectedEventTimestamp(evt.timestamp);
                            }}
                            selectedEventTimestamp={selectedEventTimestamp}
                        />
                    </div>

                    <div className="chart-card" style={{ flex: 1 }}>
                        <div className="card-header">
                            <Gauge className="icon" size={20} />
                            <h3>Gear Usage Distribution</h3>
                        </div>
                        <GearUsageChart data={metrics.gear_analytics || []} />
                    </div>

                    <div className="chart-card">
                        <div className="card-header">
                            <Zap className="icon" size={20} />
                            <h3>Top Segment Time Loss</h3>
                        </div>
                        <SegmentLeaderboard segments={segmentAnalytics} />
                    </div>
                </div>
            </div>

            {showRawData && (
                <div className="modal-overlay" onClick={() => setShowRawData(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Raw Telemetry Data</h3>
                            <div className="modal-actions">
                                <button className="btn-download" onClick={downloadJson}>Download JSON</button>
                                <button className="btn-close" onClick={() => setShowRawData(false)}>Close</button>
                            </div>
                        </div>
                        <div className="modal-body">
                            {rawData ? (
                                rawData.length > 0 ? (
                                    <div className="table-container">
                                        <table>
                                            <thead>
                                                <tr>
                                                    {Object.keys(rawData[0]).map(key => <th key={key}>{key}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rawData.slice(0, 100).map((row, i) => (
                                                    <tr key={i}>
                                                        {Object.values(row).map((val: any, j) => (
                                                            <td key={j}>{typeof val === 'number' ? val.toFixed(2) : val}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {rawData.length > 100 && <div className="more-data-indicator">...and {rawData.length - 100} more rows</div>}
                                    </div>
                                ) : <p>No telemetry frames found.</p>
                            ) : <p>Loading data...</p>}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
                .btn-header { padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-weight: 500; font-size: 0.9rem; }
                .btn-raw-data { background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-secondary); }
                .btn-raw-data:hover { border-color: var(--accent-primary); color: var(--accent-primary); }

                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 2rem;
                }
                .icon-box {
                    width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 1rem;
                }
                .icon-box.red { background: rgba(220, 0, 0, 0.2); color: #dc0000; }
                .icon-box.orange { background: rgba(255, 165, 0, 0.2); color: orange; }
                .icon-box.blue { background: rgba(0, 100, 255, 0.2); color: #0064ff; }
                .icon-box.green { background: rgba(0, 200, 100, 0.2); color: #00c864; }
                .icon-box.purple { background: rgba(150, 0, 255, 0.2); color: #9600ff; }
                .icon-box.yellow { background: rgba(255, 255, 0, 0.2); color: yellow; }
                .stat-desc { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem; }
                .charts-container { display: grid; grid-template-columns: 2fr 1.5fr; gap: 1.5rem; align-items: start; }
                @media (max-width: 1200px) {
                    .charts-container { grid-template-columns: 1fr; }
                    .map-card { position: static; top: auto; }
                }
                .chart-card { background: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); display: flex; flex-direction: column; }
                .map-card { min-height: 450px; position: sticky; top: calc(80px + 1rem); align-self: start; }
                .card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;}

                /* Modal Styles */
                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
                .modal-content { background: var(--bg-secondary); width: 90%; max-width: 1000px; height: 80vh; border-radius: 12px; border: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden; }
                .modal-header { padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
                .modal-header h3 { margin: 0; }
                .modal-actions { display: flex; gap: 1rem; }
                .btn-download { background: var(--accent-primary); color: white; padding: 0.5rem 1rem; border-radius: 6px; }
                .btn-close { background: transparent; border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: 6px; }
                .modal-body { flex: 1; overflow: hidden; padding: 1.5rem; display: flex; flex-direction: column; }
                
                .table-container { flex: 1; overflow: auto; min-height: 0; width: 100%; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-tertiary); }
                table { min-width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; }
                th { text-align: left; padding: 0.8rem; background: var(--bg-secondary); position: sticky; top: 0; z-index: 10; color: var(--text-secondary); white-space: nowrap; font-weight: 600; border-bottom: 2px solid var(--border-color); }
                td { padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--border-color); color: var(--text-muted); white-space: nowrap; background: var(--bg-card); }
                tr:hover td { background: rgba(255,255,255,0.05); color: var(--text-primary); }
                .more-data-indicator { padding: 1rem; text-align: center; color: var(--text-muted); font-style: italic; background: var(--bg-card); border-top: 1px solid var(--border-color); }
            `}</style>
        </div>
    );
};

export default AnalysisPage;
