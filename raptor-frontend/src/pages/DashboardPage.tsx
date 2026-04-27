import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ridesApi, RideSummary } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import MiniRideMap from '../components/Map/MiniRideMap';
import { Clock, Upload, Trash2, ChevronRight, MapPin, Route, Timer, Bike, Flame, LayoutGrid, List as ListIcon, Filter, Search, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type DashboardRidesCache = {
    hasFetched: boolean;
    signature: string;
    allRides: RideSummary[];
};

const DASHBOARD_RIDES_CACHE_KEY = 'raptor_dashboard_rides_cache_v1';

const getDefaultDashboardCache = (): DashboardRidesCache => ({
    hasFetched: false,
    signature: '0',
    allRides: [],
});

const getPersistedDashboardCache = (): DashboardRidesCache => {
    if (typeof window === 'undefined') {
        return getDefaultDashboardCache();
    }

    try {
        const rawCache = window.localStorage.getItem(DASHBOARD_RIDES_CACHE_KEY);
        if (!rawCache) {
            return getDefaultDashboardCache();
        }

        const parsed = JSON.parse(rawCache) as Partial<DashboardRidesCache>;
        if (!parsed || !Array.isArray(parsed.allRides)) {
            return getDefaultDashboardCache();
        }

        return {
            hasFetched: Boolean(parsed.hasFetched),
            signature: typeof parsed.signature === 'string' ? parsed.signature : '0',
            allRides: parsed.allRides,
        };
    } catch {
        return getDefaultDashboardCache();
    }
};

let dashboardRidesCache: DashboardRidesCache = getPersistedDashboardCache();

const DashboardPage: React.FC = () => {
    const { currentBike } = useAuth();
    const [allRides, setAllRides] = useState<RideSummary[]>(dashboardRidesCache.allRides);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [loadingOverview, setLoadingOverview] = useState(!dashboardRidesCache.hasFetched);
    const navigate = useNavigate();

    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMode, setFilterMode] = useState('all');
    const [filterOpen, setFilterOpen] = useState(false);

    const filterOptions: Record<string, string> = {
        all: 'All Available',
        assigned: 'Assigned Only',
        unassigned: 'Unassigned Only',
        fast: 'Fast >100km/h',
        long: 'Long >15min'
    };

    const sortByDateDesc = (items: RideSummary[]) => {
        return [...items].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    };

    const getRidesSignature = (items: RideSummary[]) => {
        if (items.length === 0) return '0';
        const latest = items[0];
        const oldest = items[items.length - 1];
        return [items.length, latest.id, latest.started_at, oldest.id, oldest.started_at].join('|');
    };

    const persistDashboardCache = (nextCache: DashboardRidesCache) => {
        if (typeof window === 'undefined') return;

        try {
            window.localStorage.setItem(DASHBOARD_RIDES_CACHE_KEY, JSON.stringify(nextCache));
        } catch {
            // Ignore storage quota and serialization issues to keep UI responsive.
        }
    };

    const loadRides = async (options?: { silent?: boolean }) => {
        if (!options?.silent && !dashboardRidesCache.hasFetched) {
            setLoadingOverview(true);
        }

        try {
            const all = await ridesApi.list();
            const sortedAll = sortByDateDesc(all || []);
            const nextSignature = getRidesSignature(sortedAll);
            const hasUpdates = nextSignature !== dashboardRidesCache.signature;

            dashboardRidesCache = {
                hasFetched: true,
                signature: nextSignature,
                allRides: sortedAll,
            };
            persistDashboardCache(dashboardRidesCache);

            if (hasUpdates) {
                setAllRides(sortedAll);
            }
        } catch (error) {
            console.error(error);

            if (!dashboardRidesCache.hasFetched) {
                setAllRides([]);
            }
        } finally {
            setLoadingOverview(false);
        }
    };

    useEffect(() => {
        if (dashboardRidesCache.hasFetched) {
            setAllRides(dashboardRidesCache.allRides);
            setLoadingOverview(false);
            loadRides({ silent: true });
            return;
        }

        loadRides();
    }, [currentBike?.id]);

    const rides = useMemo(() => {
        let list = allRides;

        // Apply drop-down filters
        if (filterMode === 'assigned') {
            list = list.filter(r => currentBike && r.bike_id === currentBike.id);
        } else if (filterMode === 'unassigned') {
            list = list.filter(r => !currentBike || r.bike_id !== currentBike.id);
        } else if (filterMode === 'fast') {
            list = list.filter(r => r.max_speed >= 100);
        } else if (filterMode === 'long') {
            list = list.filter(r => r.duration_seconds >= 15 * 60);
        }
        // filterMode === 'all' → no filter, show every ride

        // Apply textual search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(r => (r.title || 'Untitled Ride').toLowerCase().includes(q));
        }

        return list;
    }, [allRides, currentBike, filterMode, searchQuery]);

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
                            ? `Showing ${rides.length} sessions for ${currentBike.name} (including unassigned)`
                            : `Showing ${rides.length} sessions across all bikes`}
                    </p>
                </div>
            </div>

            <div className="rides-toolbar">
                <div className="toolbar-search">
                    <Search size={16} />
                    <input 
                        type="text" 
                        placeholder="Search sessions..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="toolbar-controls">
                    <div className="custom-dropdown">
                        <div className="dropdown-active" onClick={() => setFilterOpen(!filterOpen)}>
                            <Filter size={14} />
                            <span>{filterOptions[filterMode]}</span>
                            <ChevronDown size={14} />
                        </div>
                        {filterOpen && (
                            <div className="dropdown-menu">
                                {Object.entries(filterOptions).map(([key, label]) => (
                                    <div 
                                        key={key} 
                                        className={`dropdown-item ${filterMode === key ? 'selected' : ''}`}
                                        onClick={() => { setFilterMode(key); setFilterOpen(false); }}
                                    >
                                        {label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="toolbar-views">
                        <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List View"><ListIcon size={16} /></button>
                        <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid View"><LayoutGrid size={16} /></button>
                    </div>
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
                        <div className={`rides-list ${viewMode === 'grid' ? 'grid-view' : ''}`}>
                            {rides.map(ride => {
                                const isUnassigned = ride.bike_id !== currentBike?.id;

                                return (
                                    <div
                                        key={ride.id}
                                        className={`ride-card ${viewMode === 'grid' ? 'grid-view-card' : ''}`}
                                        onClick={() => handleRideClick(ride.id)}
                                    >
                                        {viewMode === 'grid' && (
                                            <div className="card-map-bg">
                                                <MiniRideMap rideId={ride.id} />
                                            </div>
                                        )}
                                        <div className="rc-header">
                                            {viewMode === 'list' && (
                                                <div className="ride-icon"><MapPin size={18} /></div>
                                            )}
                                            <div className="ride-actions">
                                                <button
                                                    className="btn-delete"
                                                    onClick={(e) => handleDelete(e, ride.id)}
                                                    title="Delete Session"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                                {viewMode === 'list' && (
                                                    <div className="btn-arrow"><ChevronRight size={18} /></div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rc-body">
                                            <div className="rc-title-row">
                                                <h4>{ride.title || 'Untitled Ride'}</h4>
                                                {isUnassigned && <span className="unassigned-badge">Unassigned</span>}
                                            </div>
                                            <span className="ride-date">{new Date(ride.started_at).toLocaleDateString()} • {new Date(ride.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>

                                        <div className="rc-spacer" />

                                        <div className="rc-footer ride-stats">
                                            <div className="stat-pill" title="Total Distance">
                                                <Route size={14} />
                                                <span>{ride.total_distance_km ? ride.total_distance_km.toFixed(1) : '0.0'} km</span>
                                            </div>
                                            <div className="stat-pill" title="Duration">
                                                <Clock size={14} />
                                                <span>{(ride.duration_seconds / 60).toFixed(0)} min</span>
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
                .dashboard-page { 
                    padding: 2rem; 
                    display: flex; 
                    flex-direction: column; 
                    gap: 2rem; 
                    max-width: 1200px;
                    margin: 0 auto;
                }

                .overview-hero {
                    background: linear-gradient(180deg, var(--bg-card, #1a1a1a) 0%, var(--bg-primary, #0d0d0d) 100%);
                    border: 1px solid var(--border-color, rgba(255,255,255,0.08));
                    border-radius: 16px;
                    padding: 2rem;
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
                    position: relative;
                    overflow: hidden;
                }
                
                .overview-hero::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; height: 2px;
                    background: linear-gradient(90deg, transparent, var(--accent-primary, #ff4444), transparent);
                    opacity: 0.3;
                }

                .hero-head-row { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: flex-end; 
                }
                
                .hero-head-row h2 { 
                    margin: 0; 
                    font-size: 1.8rem; 
                    color: var(--text-primary, #ffffff);
                    font-weight: 700;
                    letter-spacing: -0.5px;
                }
                
                .hero-head-row p { 
                    margin: 0.4rem 0 0; 
                    font-size: 0.95rem; 
                    color: var(--text-muted, #a1a1aa); 
                    font-weight: 500;
                }

                .hero-grid { 
                    display: grid; 
                    grid-template-columns: 1fr; 
                    gap: 1.5rem; 
                }
                
                @media (min-width: 900px) {
                    .hero-grid { grid-template-columns: 1.5fr 1fr; gap: 2rem; }
                }

                .hero-kpis { 
                    display: grid; 
                    grid-template-columns: repeat(2, 1fr); 
                    gap: 1rem; 
                }
                
                .hero-kpi-card {
                    background: var(--bg-card, rgba(255, 255, 255, 0.03));
                    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
                    border-radius: 12px;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    transition: all 0.2s ease;
                }
                
                .hero-kpi-card:hover {
                    background: var(--bg-card, rgba(255, 255, 255, 0.05));
                    border-color: var(--accent-primary, #ff4444);
                    transform: translateY(-2px);
                }
                
                .kpi-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    background: var(--bg-card, rgba(255, 68, 68, 0.1));
                    color: var(--accent-primary, #ff4444);
                    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .kpi-content { 
                    display: flex; 
                    flex-direction: column; 
                    gap: 0.3rem; 
                }
                
                .kpi-content span { 
                    font-size: 0.8rem; 
                    color: var(--text-muted, #a1a1aa); 
                    font-weight: 600; 
                    text-transform: uppercase; 
                    letter-spacing: 0.5px; 
                }
                
                .kpi-content strong { 
                    font-size: 1.6rem; 
                    color: var(--text-primary, #ffffff); 
                    font-weight: 700;
                    line-height: 1;
                }

                .hero-summary {
                    background: var(--bg-card, rgba(0, 0, 0, 0.2));
                    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
                    border-radius: 12px;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                
                .summary-item-line { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    font-size: 0.9rem; 
                    color: var(--text-muted, #a1a1aa); 
                    padding-bottom: 0.6rem;
                    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.04));
                }
                
                .summary-item-line:last-of-type { 
                    border-bottom: none; 
                    padding-bottom: 0; 
                }
                
                .summary-item-line strong { 
                    color: var(--text-primary, #ffffff); 
                    font-weight: 600; 
                }

                .summary-progress-wrap { 
                    margin-top: 0.8rem; 
                    display: flex; 
                    flex-direction: column; 
                    gap: 0.6rem; 
                }
                
                .summary-progress-label { 
                    display: flex; 
                    justify-content: space-between; 
                    font-size: 0.8rem; 
                    color: var(--text-primary, #e4e4e7); 
                    font-weight: 500;
                }
                
                .summary-progress-track {
                    height: 6px;
                    border-radius: 3px;
                    background: var(--bg-card, rgba(0, 0, 0, 0.4));
                    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
                    overflow: hidden;
                }
                
                .summary-progress-fill {
                    height: 100%;
                    border-radius: 3px;
                    background: var(--accent-primary, #ff4444);
                    box-shadow: 0 0 10px var(--accent-primary, rgba(255, 68, 68, 0.4));
                }
                
                .hero-footnote { 
                    font-size: 0.75rem; 
                    color: var(--text-muted, #63636b); 
                    text-align: right; 
                    margin-top: 0.5rem; 
                    font-style: italic;
                }

                .dashboard-header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: flex-end; 
                    padding-bottom: 0.5rem;
                    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
                }
                
                .dashboard-header h3 { 
                    margin: 0; 
                    font-size: 1.4rem; 
                    font-weight: 600; 
                    color: var(--text-primary, #ffffff); 
                }
                
                .dashboard-subtitle { 
                    margin: 0.4rem 0 0; 
                    font-size: 0.9rem; 
                    color: var(--text-muted, #a1a1aa); 
                }
                
                .btn-upload { 
                    background: var(--accent-primary, #ff4444);
                    color: white; 
                    border: none;
                    padding: 0.6rem 1.2rem; 
                    border-radius: 8px; 
                    display: flex; 
                    align-items: center; 
                    gap: 0.5rem; 
                    font-size: 0.9rem; 
                    font-weight: 600; 
                    cursor: pointer; 
                    transition: all 0.2s ease; 
                    box-shadow: 0 4px 12px rgba(255, 68, 68, 0.2);
                }
                
                .btn-upload:hover { 
                    filter: brightness(1.1);
                    transform: translateY(-1px);
                    box-shadow: 0 6px 16px rgba(255, 68, 68, 0.3);
                }
                
                .btn-upload:disabled { 
                    opacity: 0.5; 
                    cursor: not-allowed; 
                    transform: none;
                }

                /* ── Toolbar ── */
                .rides-toolbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: transparent;
                    padding: 0 0 1rem 0;
                    margin-top: 0.5rem;
                }
                .toolbar-search {
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255,255,255,0.08); /* Soft glass border */
                    padding: 0.6rem 1rem;
                    border-radius: 12px;
                    width: 320px;
                    color: rgba(255,255,255,0.6);
                    transition: all 0.2s;
                }
                .toolbar-search:focus-within {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: rgba(255,255,255,0.15);
                    color: white;
                }
                .toolbar-search input {
                    background: transparent;
                    border: none;
                    outline: none;
                    color: #fff;
                    width: 100%;
                    font-size: 0.9rem;
                    font-family: inherit;
                }
                .toolbar-controls {
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                }
                /* Custom Dropdown */
                .custom-dropdown {
                    position: relative;
                    user-select: none;
                }
                .dropdown-active {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.08);
                    padding: 0.6rem 1rem;
                    border-radius: 12px;
                    color: rgba(255,255,255,0.8);
                    cursor: pointer;
                    font-size: 0.9rem;
                    transition: all 0.2s;
                }
                .dropdown-active:hover {
                    background: rgba(255,255,255,0.06);
                }
                .dropdown-menu {
                    position: absolute;
                    top: calc(100% + 8px);
                    right: 0;
                    width: 200px;
                    background: #18181b;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    box-shadow: 0 12px 24px rgba(0,0,0,0.5);
                    overflow: hidden;
                    z-index: 100;
                    padding: 0.4rem;
                }
                .dropdown-item {
                    padding: 0.6rem 1rem;
                    font-size: 0.9rem;
                    color: rgba(255,255,255,0.7);
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.2s;
                }
                .dropdown-item:hover {
                    background: rgba(255,255,255,0.05);
                    color: white;
                }
                .dropdown-item.selected {
                    background: rgba(255, 68, 68, 0.1);
                    color: #ff4444;
                    font-weight: 500;
                }
                /* Layout Toggle Pills */
                .toolbar-views {
                    display: flex;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 12px;
                    padding: 0.25rem;
                }
                .view-btn {
                    background: transparent;
                    border: none;
                    color: rgba(255,255,255,0.4);
                    padding: 0.5rem 0.8rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    border-radius: 8px;
                    transition: all 0.2s;
                }
                .view-btn:hover {
                    color: rgba(255,255,255,0.8);
                }
                .view-btn.active {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }
                
                /* ── Rides List / Grid ── */
                .rides-list { 
                    display: flex; 
                    flex-direction: column; 
                    gap: 1rem; 
                }
                .rides-list.grid-view {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
                    gap: 1.2rem;
                }
                
                .ride-card { 
                    background: var(--bg-card); 
                    padding: 1.2rem; 
                    border-radius: 12px; 
                    border: 1px solid var(--border-color); 
                    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); 
                    cursor: pointer; 
                    position: relative;
                    overflow: hidden;
                }
                .ride-card:hover { 
                    transform: translateY(-4px); 
                    border-color: var(--accent-primary); 
                    box-shadow: 0 12px 32px rgba(0,0,0,0.4);
                    background: linear-gradient(135deg, var(--bg-card) 0%, rgba(255,255,255,0.03) 100%);
                }

                .ride-card > * {
                    position: relative;
                    z-index: 10;
                }

                .card-map-bg {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    z-index: 0 !important;
                    opacity: 0;
                    transition: opacity 0.5s ease;
                }
                
                .ride-card.grid-view-card .card-map-bg {
                    opacity: 1;
                }

                /* ---- Base List Mode Mapping ---- */
                .ride-card:not(.grid-view-card) {
                    display: grid; 
                    grid-template-columns: auto 1fr auto auto; 
                    align-items: center; 
                    gap: 1.5rem; 
                }
                .ride-card:not(.grid-view-card) .rc-header {
                    display: flex; gap: 1.5rem; align-items: center;
                }
                .ride-card:not(.grid-view-card) .rc-body {
                     display: flex; flex-direction: column; gap: 0.2rem;
                }
                .ride-card:not(.grid-view-card) .rc-title-row {
                     display: flex; align-items: center; gap: 0.5rem;
                }
                .ride-card:not(.grid-view-card) .rc-spacer { display: none; }
                .ride-card:not(.grid-view-card) .ride-actions {
                    display: flex; align-items: center; gap: 1rem;
                }

                /* ---- Grid View Structuring ---- */
                .grid-view-card {
                    display: flex;
                    flex-direction: column;
                    min-height: 340px;
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.07);
                    box-shadow:
                        0 8px 32px rgba(0, 0, 0, 0.5),
                        inset 0 1px 0 rgba(255, 255, 255, 0.06);
                    gap: 0;
                    padding: 0;
                    overflow: hidden;
                    position: relative;
                    transition:
                        transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                        box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                        border-color 0.35s ease;
                }
                .grid-view-card:hover {
                    transform: translateY(-5px) scale(1.012);
                    border-color: rgba(220, 0, 0, 0.28);
                    box-shadow:
                        0 20px 56px rgba(0, 0, 0, 0.65),
                        0 0 0 1px rgba(220, 0, 0, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.1);
                }
                /* Map zoom-in on card hover */
                .grid-view-card .card-map-bg {
                    transition: transform 0.65s cubic-bezier(0.22, 1, 0.36, 1),
                                filter 0.45s ease;
                    transform-origin: center;
                    will-change: transform;
                }
                .grid-view-card:hover .card-map-bg {
                    transform: scale(1.07);
                    filter: brightness(1.15) saturate(1.2);
                }
                .grid-view-card .rc-header {
                    position: absolute;
                    top: 1.2rem;
                    right: 1.2rem;
                    z-index: 20;
                    margin: 0;
                    padding: 0;
                }
                .grid-view-card .ride-actions {
                    display: flex;
                }
                .grid-view-card .rc-body {
                    display: flex;
                    flex-direction: column;
                    padding: 1.2rem 1.2rem 0;
                }
                .grid-view-card .rc-title-row {
                    display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.2rem;
                }
                .grid-view-card h4 {
                    font-family: var(--font-heading);
                    font-size: 1.05rem;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                    line-height: 1.25;
                    color: transparent;
                    background: linear-gradient(160deg, #ffffff 30%, rgba(255,255,255,0.65) 100%);
                    -webkit-background-clip: text;
                    background-clip: text;
                    margin: 0;
                    text-shadow: none;
                    filter: drop-shadow(0 2px 16px rgba(0,0,0,0.9));
                }
                .grid-view-card .unassigned-badge {
                    display: none;
                }
                .grid-view-card .ride-date {
                    font-size: 0.72rem;
                    color: rgba(255,255,255,0.35);
                    letter-spacing: 0.03em;
                    margin-top: 0.3rem;
                    font-weight: 500;
                }
                .grid-view-card .rc-spacer {
                    flex-grow: 1; /* Pushes footer down */
                }
                .grid-view-card .rc-footer {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.8rem;
                    margin-top: auto;
                    background: transparent;
                    border-top: none;
                    padding: 1.5rem 1.2rem 1rem;
                    position: relative;
                    z-index: 10;
                }
                .grid-view-card .stat-pill {
                    background: rgba(10, 10, 10, 0.55);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.85);
                    justify-content: center;
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
                .rc-body h4 { margin: 0; color: var(--text-primary); font-size: 1.1rem; font-weight: 600; }
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
