import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ridesApi, RideSummary } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Gauge, Upload, Trash2, ChevronRight, MapPin, Route, Timer, Bike, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DashboardPage: React.FC = () => {
    const { currentBike } = useAuth();
    const [rides, setRides] = useState<RideSummary[]>([]);
    const [allRides, setAllRides] = useState<RideSummary[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [loadingOverview, setLoadingOverview] = useState(true);
    const navigate = useNavigate();

    const sortByDateDesc = (items: RideSummary[]) => {
        return [...items].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    };

    const loadRides = async () => {
        setLoadingOverview(true);
        try {
            const [all, scoped] = await Promise.all([
                ridesApi.list(),
                currentBike ? ridesApi.list(currentBike.id) : Promise.resolve([]),
            ]);

            const sortedAll = sortByDateDesc(all || []);
            const sortedScoped = sortByDateDesc(scoped || []);

            setAllRides(sortedAll);
            setRides(currentBike ? sortedScoped : sortedAll);
        } catch (error) {
            console.error(error);
            setAllRides([]);
            setRides([]);
        } finally {
            setLoadingOverview(false);
        }
    };

    useEffect(() => {
        loadRides();
    }, [currentBike]);

    const analytics = useMemo(() => {
        const totalRides = allRides.length;
        const totalDistanceKm = allRides.reduce((sum, ride) => sum + (Number(ride.total_distance_km) || 0), 0);
        const totalDurationSeconds = allRides.reduce((sum, ride) => sum + (Number(ride.duration_seconds) || 0), 0);
        const topSpeedKph = allRides.reduce((max, ride) => Math.max(max, Number(ride.max_speed) || 0), 0);
        const avgRideSpeed = totalRides > 0
            ? allRides.reduce((sum, ride) => sum + (Number(ride.avg_speed) || 0), 0) / totalRides
            : 0;

        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const ridesLast7Days = allRides.filter((ride) => new Date(ride.started_at).getTime() >= weekAgo).length;

        const activeBikeCount = new Set(
            allRides
                .map((ride) => ride.bike_id)
                .filter((bikeId) => bikeId !== null && bikeId !== undefined)
        ).size;

        const currentBikeSessions = currentBike
            ? allRides.filter((ride) => ride.bike_id === currentBike.id).length
            : totalRides;

        const coveragePct = totalRides > 0 ? Math.round((currentBikeSessions / totalRides) * 100) : 0;
        const lastRide = allRides[0];

        return {
            totalRides,
            totalDistanceKm,
            totalDurationHours: totalDurationSeconds / 3600,
            topSpeedKph,
            avgRideSpeed,
            ridesLast7Days,
            activeBikeCount,
            currentBikeSessions,
            coveragePct,
            lastRideAt: lastRide?.started_at,
        };
    }, [allRides, currentBike]);

    const formatCompact = (value: number) => {
        if (!Number.isFinite(value)) return '0';
        if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
        return value.toFixed(0);
    };

    const formatHours = (value: number) => {
        if (!Number.isFinite(value)) return '0h';
        if (value >= 100) return `${value.toFixed(0)}h`;
        return `${value.toFixed(1)}h`;
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!currentBike) {
            alert("Please select a bike profile first.");
            return;
        }

        setUploading(true);
        try {
            await ridesApi.uploadCsv(file, currentBike.id);
            loadRides();
            alert("Ride imported successfully!");
        } catch (error) {
            console.error(error);
            alert("Failed to upload CSV");
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDelete = async (e: React.MouseEvent, rideId: string) => {
        e.stopPropagation(); // Prevent navigation when clicking delete
        if (window.confirm("Are you sure you want to delete this session? This action cannot be undone.")) {
            try {
                await ridesApi.deleteRide(rideId);
                await loadRides();
            } catch (error) {
                console.error("Failed to delete ride", error);
                alert("Failed to delete session");
            }
        }
    };

    const handleRideClick = (rideId: string) => {
        navigate(`/rides/${rideId}`);
    };

    return (
        <div className="dashboard-page">
            <section className="overview-hero">
                <div className="hero-head-row">
                    <div>
                        <h2>Rider Command Center</h2>
                        <p>
                            Unified analytics across all rides{currentBike ? ` • Focused bike: ${currentBike.name}` : ''}
                        </p>
                    </div>
                    <div className="actions">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".csv"
                            style={{ display: 'none' }}
                        />
                        <button
                            className="btn-upload"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                        >
                            <Upload size={18} />
                            {uploading ? 'Importing...' : 'Import CSV'}
                        </button>
                    </div>
                </div>

                <div className="hero-grid">
                    <div className="hero-kpis">
                        <div className="hero-kpi-card">
                            <div className="kpi-icon"><Bike size={16} /></div>
                            <div className="kpi-content">
                                <span>Total Rides</span>
                                <strong>{formatCompact(analytics.totalRides)}</strong>
                            </div>
                        </div>
                        <div className="hero-kpi-card">
                            <div className="kpi-icon"><Route size={16} /></div>
                            <div className="kpi-content">
                                <span>Total Distance</span>
                                <strong>{analytics.totalDistanceKm.toFixed(1)} km</strong>
                            </div>
                        </div>
                        <div className="hero-kpi-card">
                            <div className="kpi-icon"><Timer size={16} /></div>
                            <div className="kpi-content">
                                <span>Total Time</span>
                                <strong>{formatHours(analytics.totalDurationHours)}</strong>
                            </div>
                        </div>
                        <div className="hero-kpi-card">
                            <div className="kpi-icon"><Flame size={16} /></div>
                            <div className="kpi-content">
                                <span>Peak Speed</span>
                                <strong>{analytics.topSpeedKph.toFixed(0)} km/h</strong>
                            </div>
                        </div>
                    </div>

                    <div className="hero-summary">
                        <div className="summary-item-line">
                            <span>Avg ride speed</span>
                            <strong>{analytics.avgRideSpeed.toFixed(1)} km/h</strong>
                        </div>
                        <div className="summary-item-line">
                            <span>Rides in last 7 days</span>
                            <strong>{analytics.ridesLast7Days}</strong>
                        </div>
                        <div className="summary-item-line">
                            <span>Active bikes</span>
                            <strong>{analytics.activeBikeCount || 1}</strong>
                        </div>
                        <div className="summary-item-line">
                            <span>{currentBike ? 'Current bike coverage' : 'All rides coverage'}</span>
                            <strong>{analytics.coveragePct}%</strong>
                        </div>

                        <div className="summary-progress-wrap">
                            <div className="summary-progress-label">
                                <span>{currentBike ? 'Current bike sessions' : 'Visible sessions'}</span>
                                <span>{analytics.currentBikeSessions}/{analytics.totalRides || analytics.currentBikeSessions}</span>
                            </div>
                            <div className="summary-progress-track">
                                <div className="summary-progress-fill" style={{ width: `${analytics.coveragePct}%` }} />
                            </div>
                        </div>

                        <div className="hero-footnote">
                            Last recorded ride:{' '}
                            {analytics.lastRideAt ? new Date(analytics.lastRideAt).toLocaleString() : 'No rides yet'}
                        </div>
                    </div>
                </div>
            </section>

            <div className="dashboard-header">
                <div>
                    <h3>Recent Sessions</h3>
                    <p className="dashboard-subtitle">
                        {currentBike
                            ? `Showing ${rides.length} sessions for ${currentBike.name}`
                            : `Showing ${rides.length} sessions across all bikes`}
                    </p>
                </div>
            </div>

            <div className="recent-rides">
                {loadingOverview && allRides.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon-bg">
                            <Clock size={48} />
                        </div>
                        <p>Loading overview analytics...</p>
                        <span className="sub-text">Crunching your ride history.</span>
                    </div>
                ) : (
                    rides.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon-bg">
                                <Clock size={48} />
                            </div>
                            <p>No rides recorded yet.</p>
                            <span className="sub-text">Import a CSV or record a ride to get started.</span>
                        </div>
                    ) : (
                        <div className="rides-list">
                            {rides.map(ride => {
                                const isUnassigned = ride.bike_id !== currentBike?.id;

                                return (
                                    <div
                                        key={ride.id}
                                        className="ride-card"
                                        onClick={() => handleRideClick(ride.id)}
                                    >
                                        <div className="ride-icon">
                                            <MapPin size={24} />
                                        </div>
                                        <div className="ride-info">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <h4>{ride.title || 'Untitled Ride'}</h4>
                                                {isUnassigned && (
                                                    <span className="unassigned-badge">Unassigned</span>
                                                )}
                                            </div>
                                            <span className="ride-date">{new Date(ride.started_at).toLocaleDateString()} • {new Date(ride.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>

                                        <div className="ride-stats">
                                            <div className="stat-pill" title="Max Speed">
                                                <Gauge size={14} />
                                                <span>{ride.max_speed ? ride.max_speed.toFixed(0) : 0} km/h</span>
                                            </div>
                                            <div className="stat-pill" title="Duration">
                                                <Clock size={14} />
                                                <span>{(ride.duration_seconds / 60).toFixed(0)} min</span>
                                            </div>
                                        </div>

                                        <div className="ride-actions">
                                            <button
                                                className="btn-delete"
                                                onClick={(e) => handleDelete(e, ride.id)}
                                                title="Delete Session"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                            <div className="btn-arrow">
                                                <ChevronRight size={20} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}
            </div>

            <style>{`
                .dashboard-page { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }

                .overview-hero {
                    position: relative;
                    background: linear-gradient(145deg, rgba(8, 8, 12, 0.95) 0%, rgba(18, 12, 12, 0.98) 100%);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 20px;
                    padding: 2rem;
                    box-shadow: 
                        0 24px 54px rgba(0, 0, 0, 0.6), 
                        inset 0 1px 0 rgba(255, 255, 255, 0.08),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.5);
                    overflow: hidden;
                }
                .overview-hero::before {
                    content: '';
                    position: absolute;
                    top: -50%; left: -50%; width: 200%; height: 200%;
                    background: radial-gradient(circle at center, rgba(255, 60, 60, 0.12) 0%, rgba(220, 0, 0, 0.05) 30%, transparent 70%);
                    pointer-events: none;
                    animation: pulseGlow 8s ease-in-out infinite alternate;
                }
                @keyframes pulseGlow {
                    0% { transform: scale(0.95); opacity: 0.8; }
                    100% { transform: scale(1.05); opacity: 1; }
                }
                .hero-head-row { position: relative; display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; margin-bottom: 1.8rem; z-index: 1; }
                .hero-head-row h2 { 
                    margin: 0; 
                    font-size: 2.2rem; 
                    background: linear-gradient(to right, #ffffff, #ffb3b3);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    letter-spacing: -0.8px; 
                    font-weight: 800; 
                }
                .hero-head-row p { margin: 0.4rem 0 0; font-size: 1rem; color: #a1a1aa; font-weight: 500; }

                .hero-grid { position: relative; display: grid; grid-template-columns: 1.6fr 1.1fr; gap: 1.2rem; z-index: 1; }
                .hero-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.2rem; }
                .hero-kpi-card {
                    position: relative;
                    border: 1px solid rgba(255, 255, 255, 0.04);
                    background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
                    border-radius: 16px;
                    padding: 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    overflow: hidden;
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                }
                .hero-kpi-card::after {
                    content: '';
                    position: absolute;
                    top: 0; left: -100%; width: 50%; height: 100%;
                    background: linear-gradient(to right, transparent, rgba(255,255,255,0.05), transparent);
                    transform: skewX(-20deg);
                    transition: left 0.6s ease;
                }
                .hero-kpi-card:hover {
                    transform: translateY(-6px) scale(1.02);
                    border-color: rgba(255, 70, 70, 0.4);
                    box-shadow: 
                        0 16px 32px rgba(0, 0, 0, 0.4), 
                        0 0 30px rgba(220, 0, 0, 0.15),
                        inset 0 1px 0 rgba(255,255,255,0.1);
                    background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
                    z-index: 2;
                }
                .hero-kpi-card:hover::after { left: 200%; }
                
                .kpi-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 14px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    color: #ff6b6b;
                    background: linear-gradient(135deg, rgba(255,40,40,0.15) 0%, rgba(200,0,0,0.05) 100%);
                    box-shadow: 
                        inset 0 1px 1px rgba(255,255,255,0.1),
                        0 4px 10px rgba(220,0,0,0.2);
                    transition: all 0.3s ease;
                }
                .hero-kpi-card:hover .kpi-icon {
                    color: #ffffff;
                    background: linear-gradient(135deg, var(--accent-primary) 0%, #a00 100%);
                    transform: scale(1.1) rotate(5deg);
                    box-shadow: 0 8px 16px rgba(220,0,0,0.4);
                }
                .kpi-content { display: flex; flex-direction: column; gap: 0.2rem; }
                .kpi-content span { font-size: 0.8rem; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; }
                .kpi-content strong { font-size: 1.5rem; color: #ffffff; line-height: 1.1; font-weight: 800; letter-spacing: -0.5px;}

                .hero-summary {
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.005) 100%);
                    border-radius: 16px;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    gap: 0.8rem;
                    box-shadow: 
                        inset 0 1px 0 rgba(255,255,255,0.05),
                        0 8px 24px rgba(0,0,0,0.15);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
                }
                .hero-summary:hover {
                    transform: translateY(-3px);
                    border-color: rgba(255,255,255,0.15);
                    box-shadow: 0 12px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1);
                }
                .summary-item-line { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; font-size: 0.9rem; color: #a1a1aa; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 0.4rem;}
                .summary-item-line:last-of-type { border-bottom: none; padding-bottom: 0; }
                .summary-item-line strong { color: #ffffff; font-weight: 700; font-size: 1rem;}

                .summary-progress-wrap { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.8rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.03);}
                .summary-progress-label { display: flex; justify-content: space-between; font-size: 0.8rem; color: #e4e4e7; font-weight: 600;}
                .summary-progress-label span:last-child { color: var(--accent-primary); background: rgba(220,0,0,0.15); padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.75rem;}
                .summary-progress-track {
                    height: 8px;
                    border-radius: 999px;
                    background: rgba(0,0,0,0.4);
                    overflow: hidden;
                    box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
                    border: 1px solid rgba(255,255,255,0.05);
                }
                .summary-progress-fill {
                    height: 100%;
                    border-radius: 999px;
                    background: linear-gradient(90deg, #ff3333, #ff0000);
                    box-shadow: 0 0 12px rgba(255, 60, 60, 0.6);
                    position: relative;
                }
                .summary-progress-fill::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
                    animation: shimmerFast 1.5s infinite;
                }
                @keyframes shimmerFast { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                .hero-footnote { font-size: 0.75rem; color: #52525b; text-align: center; margin-top: 0.2rem; font-style: italic;}

                .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-top: 0.2rem; }
                .dashboard-header h3 { margin: 0; font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
                .dashboard-subtitle { margin: 0.2rem 0 0; font-size: 0.84rem; color: var(--text-muted); }
                
                .btn-upload { background: linear-gradient(135deg, var(--accent-primary) 0%, #8a0000 100%); border: none; color: white; padding: 0.6rem 1.2rem; border-radius: 8px; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(220,0,0,0.3); }
                .btn-upload:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(220,0,0,0.5); filter: brightness(1.1); }
                .btn-upload:disabled { opacity: 0.7; cursor: not-allowed; transform: none; filter: grayscale(1); }
                
                .rides-list { display: flex; flex-direction: column; gap: 1rem; }
                
                .ride-card { 
                    background: var(--bg-card); 
                    padding: 1.2rem; 
                    border-radius: 12px; 
                    border: 1px solid var(--border-color); 
                    display: grid; 
                    grid-template-columns: auto 1fr auto auto; 
                    align-items: center; 
                    gap: 1.5rem; 
                    transition: all 0.2s ease; 
                    cursor: pointer; 
                    position: relative;
                    overflow: hidden;
                }
                .ride-card:hover { 
                    transform: translateY(-2px); 
                    border-color: var(--accent-primary); 
                    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                    background: linear-gradient(90deg, var(--bg-card) 0%, rgba(255,255,255,0.03) 100%);
                }
                
                .ride-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--accent-primary);
                }
                .ride-card:hover .ride-icon {
                    background: var(--accent-primary);
                    color: #000;
                }

                .ride-info { display: flex; flex-direction: column; gap: 0.2rem; }
                .ride-info h4 { margin: 0; color: var(--text-primary); font-size: 1.1rem; font-weight: 600; }
                .ride-date { font-size: 0.85rem; color: var(--text-muted); }
                
                .unassigned-badge {
                    background: rgba(255, 165, 0, 0.15);
                    color: #ffa500;
                    font-size: 0.7rem;
                    padding: 0.2rem 0.5rem;
                    border-radius: 4px;
                    border: 1px solid rgba(255, 165, 0, 0.3);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .ride-stats { display: flex; gap: 0.8rem; }
                .stat-pill { 
                    display: flex; 
                    align-items: center; 
                    gap: 0.4rem; 
                    background: rgba(255,255,255,0.05); 
                    padding: 0.4rem 0.8rem; 
                    border-radius: 20px; 
                    font-size: 0.85rem; 
                    color: var(--text-secondary); 
                    border: 1px solid transparent;
                }
                .ride-card:hover .stat-pill {
                    border-color: rgba(255,255,255,0.1);
                    background: rgba(255,255,255,0.1);
                }
                
                .ride-actions { display: flex; align-items: center; gap: 1rem; }
                
                .btn-delete { 
                    background: transparent; 
                    border: none; 
                    color: var(--text-muted); 
                    padding: 0.5rem; 
                    border-radius: 8px; 
                    cursor: pointer; 
                    transition: all 0.2s;
                    display: flex; align-items: center; justify-content: center;
                }
                .btn-delete:hover { 
                    background: rgba(255, 77, 77, 0.1); 
                    color: #ff4d4d; 
                }
                
                .btn-arrow { color: var(--text-muted); transition: transform 0.2s; }
                .ride-card:hover .btn-arrow { transform: translateX(4px); color: var(--accent-primary); }

                .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 2rem; text-align: center; background: var(--bg-card); border-radius: 16px; border: 1px dashed var(--border-color); }
                .empty-icon-bg { width: 80px; height: 80px; background: rgba(255,255,255,0.03); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; color: var(--text-muted); }
                .empty-state p { font-size: 1.2rem; margin: 0 0 0.5rem; color: var(--text-primary); }
                .sub-text { color: var(--text-muted); font-size: 0.9rem; }

                @media (max-width: 1080px) {
                    .hero-grid { grid-template-columns: 1fr; }
                }

                @media (max-width: 780px) {
                    .hero-head-row { flex-direction: column; align-items: flex-start; }
                    .hero-kpis { grid-template-columns: 1fr; }
                    .ride-card {
                        grid-template-columns: 1fr;
                        gap: 0.9rem;
                    }
                    .ride-actions {
                        justify-content: space-between;
                    }
                }
            `}</style>
        </div>
    );
};

export default DashboardPage;
