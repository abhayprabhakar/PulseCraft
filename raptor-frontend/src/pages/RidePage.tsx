import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, BarChart2, Cpu, Send, LayoutPanelLeft, MessageSquare, Plus, Trash2, Clock, RefreshCcw, X, MapPin } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush, ReferenceArea, ReferenceLine, ReferenceDot
} from 'recharts';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Activity, Shield, Map as MapIcon, Gauge, AlertTriangle } from 'lucide-react';
import { ridesApi, RideAnalysis, AiPersona, LlmProviderOption } from '../services/api';
import AnalysisMap from '../components/Map/AnalysisMap';
import GearUsageChart from '../components/analytics/GearUsageChart';
import EventTimeline from '../components/analytics/EventTimeline';
import SegmentLeaderboard from '../components/analytics/SegmentLeaderboard';
import CoachingPanel from '../components/analytics/CoachingPanel';
import { useChatSessions, ChatMessage } from '../hooks/useChatSessions';
import { CustomSelect } from '../components/Controls/CustomSelect';

type Tab = 'analysis' | 'timeseries';
type LayoutMode = 'chart' | 'chat';

interface TelemetryPoint {
    timestamp_ms: number;
    pointKey: string;
    speed_kph: number;
    rpm: number;
    timeLabel: string;
    elapsedLabel?: string;
    gear?: number;
    coolant_temp_c?: number;
    lat?: number;
    lng?: number;
}

interface AnalysisEventData {
    type: string;
    timestamp: string;
    magnitude_mps2: number;
    speed_kph: number;
    lat?: number;
    lng?: number;
}

function toFiniteNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function normalizeTimestampMs(value: unknown): number | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            return normalizeTimestampMs(Number(trimmed));
        }
        const parsedDate = Date.parse(trimmed);
        if (Number.isFinite(parsedDate)) return parsedDate;
        return null;
    }

    const numeric = toFiniteNumber(value);
    if (numeric === null) return null;

    const absolute = Math.abs(numeric);

    // Unix epoch in seconds (~1.7e9 today) -> convert to ms
    if (absolute >= 1e9 && absolute < 1e11) {
        return numeric * 1000;
    }

    // Very small numeric values are usually elapsed seconds -> convert to ms
    if (absolute > 0 && absolute < 1e5) {
        return numeric * 1000;
    }

    // Keep elapsed milliseconds and epoch milliseconds as-is
    return numeric;
}

function getTimestampMsFromPoint(point: any): number | null {
    return (
        normalizeTimestampMs(point?.timestamp_ms) ??
        normalizeTimestampMs(point?.timestamp) ??
        normalizeTimestampMs(point?.time) ??
        normalizeTimestampMs(point?.ts) ??
        normalizeTimestampMs(point?.created_at)
    );
}

function getLatLngFromPoint(point: any): [number, number] | null {
    const lat = toFiniteNumber(point?.lat ?? point?.latitude);
    const lng = toFiniteNumber(point?.lng ?? point?.longitude);
    if (lat === null || lng === null) return null;
    if (Math.abs(lat) <= 0.001 || Math.abs(lng) <= 0.001) return null;
    return [lat, lng];
}

function getFirstNumeric(point: any, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = toFiniteNumber(point?.[key]);
        if (value !== null) return value;
    }
    return undefined;
}

function downsampleRoute(points: [number, number][], maxPoints: number = 1400): [number, number][] {
    if (points.length <= maxPoints) return points;
    const step = Math.ceil(points.length / maxPoints);
    const sampled = points.filter((_, index) => index % step === 0);
    const last = points[points.length - 1];
    if (sampled[sampled.length - 1] !== last) sampled.push(last);
    return sampled;
}

function formatElapsedLabel(elapsedMs: number): string {
    const safeMs = Math.max(0, Math.floor(elapsedMs));
    const totalSeconds = Math.floor(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `+${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function parseElapsedTokenToSeconds(token: string): number | null {
    const match = token.match(/^\+?(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return hours * 3600 + minutes * 60 + seconds;
}

function normalizeElapsedToken(token: string): string {
    const match = token.match(/^\+?(\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
    if (!match) return token;
    return `+${match[1]}`;
}

function normalizeExplicitTimeLinks(markdown: string): string {
    const backtickedTimeLinkRegex = /`\s*(\[\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?\]\(time:\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?\))\s*`/g;
    const explicitTimeLinkRegex = /\[(\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\(time:(\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?)\)/g;

    const unwrapped = markdown.replace(backtickedTimeLinkRegex, '$1');
    return unwrapped.replace(explicitTimeLinkRegex, (_full, label, target) => {
        const normalizedLabel = normalizeElapsedToken(label);
        const normalizedTarget = normalizeElapsedToken(target);
        return `[${normalizedLabel}](time:${normalizedTarget})`;
    });
}

function enrichMessageWithTimeLinks(markdown: string): string {
    const normalizedInput = normalizeExplicitTimeLinks(markdown);
    const protectedTimeLinks: string[] = [];

    const placeholderInput = normalizedInput.replace(
        /\[\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?\]\(time:\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?\)/g,
        (match) => {
            const index = protectedTimeLinks.push(match) - 1;
            return `__TIME_LINK_${index}__`;
        },
    );

    const timeRegex = /(^|[^\w])(\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?=$|[^\w])/g;
    const enriched = placeholderInput.replace(timeRegex, (_full, prefix, timeToken) => {
        const normalized = normalizeElapsedToken(timeToken);
        return `${prefix}[${normalized}](time:${normalized})`;
    });

    return enriched.replace(/__TIME_LINK_(\d+)__/g, (_full, idx) => {
        return protectedTimeLinks[Number(idx)] || _full;
    });
}

function extractElapsedTokenFromMarkdownLink(href: string | undefined, children: React.ReactNode): string | null {
    const fromHref = href?.startsWith('time:') ? href.slice('time:'.length) : null;

    const rawChildrenText = Array.isArray(children)
        ? children.map((item) => (typeof item === 'string' ? item : '')).join('')
        : (typeof children === 'string' ? children : '');

    const fromText = /^\+?\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(rawChildrenText)
        ? rawChildrenText
        : null;

    const token = fromHref ?? fromText;
    return token ? normalizeElapsedToken(token) : null;
}

function buildChatHistoryForRequest(messages: ChatMessage[], maxItems: number = 12) {
    const starterHint = 'select a range of data on the chart using the **brush slider**';

    return messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .filter((message) => {
            const content = (message.content || '').trim();
            if (!content) return false;
            const normalized = content.toLowerCase();
            if (message.role === 'assistant' && normalized.includes(starterHint)) return false;
            return true;
        })
        .slice(-maxItems)
        .map((message) => ({
            role: message.role,
            content: (message.content || '').trim(),
            timestamp: message.timestamp,
        }));
}

// ============ Telemetry Map helpers ============
function MapAutoFit({
    positions,
    selectedPositions
}: {
    positions: [number, number][];
    selectedPositions: [number, number][];
}) {
    const map = useMap();
    useEffect(() => {
        const target = selectedPositions.length > 1 ? selectedPositions : positions;
        if (target.length > 1) {
            try { map.fitBounds(target as any, { padding: [20, 20], maxZoom: 17 }); } catch { /* ignore */ }
        }
    }, [map, positions, selectedPositions]);
    return null;
}

function MapClickHandler({ gpsData, onPin }: {
    gpsData: TelemetryPoint[];
    onPin: (p: TelemetryPoint) => void;
}) {
    useMapEvents({
        click(e) {
            let minD = Infinity, nearest: TelemetryPoint | null = null;
            for (const p of gpsData) {
                const d = (e.latlng.lat - p.lat!) ** 2 + (e.latlng.lng - p.lng!) ** 2;
                if (d < minD) { minD = d; nearest = p; }
            }
            if (nearest) onPin(nearest);
        }
    });
    return null;
}

function MapResizeHandler({ resizeSignal }: { resizeSignal: string }) {
    const map = useMap();

    useEffect(() => {
        const runInvalidate = () => {
            try {
                map.invalidateSize(false);
            } catch {
                /* ignore */
            }
        };

        const t1 = window.setTimeout(runInvalidate, 0);
        const t2 = window.setTimeout(runInvalidate, 140);
        const t3 = window.setTimeout(runInvalidate, 340);

        const container = map.getContainer();
        const observer = new ResizeObserver(() => runInvalidate());
        observer.observe(container);

        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
            observer.disconnect();
        };
    }, [map, resizeSignal]);

    return null;
}

function TelemetryMap({ telemetryData, timeRange, pinnedPoint, hoveredPoint, mapResizeSignal, setPinnedPoint }: {
    telemetryData: TelemetryPoint[];
    timeRange: { startIndex: number; endIndex: number } | null;
    pinnedPoint: TelemetryPoint | null;
    hoveredPoint: TelemetryPoint | null;
    mapResizeSignal: string;
    setPinnedPoint: (p: TelemetryPoint | null) => void;
}) {
    const gpsData = useMemo(
        () => telemetryData.filter(p => p.lat && p.lng && Math.abs(p.lat) > 0.001),
        [telemetryData]
    );

    const si = timeRange?.startIndex ?? 0;
    const ei = timeRange?.endIndex ?? telemetryData.length - 1;
    const selData = useMemo(
        () => telemetryData.slice(si, ei + 1).filter(p => p.lat && p.lng && Math.abs(p.lat) > 0.001),
        [telemetryData, si, ei]
    );
    const handlePin = useCallback((p: TelemetryPoint) => setPinnedPoint(p), [setPinnedPoint]);

    if (gpsData.length < 2) {
        return (
            <div className="ts-map-no-gps">
                <MapPin size={18} />
                <span>No GPS data</span>
            </div>
        );
    }

    const fullRouteRaw: [number, number][] = gpsData.map(p => [p.lat!, p.lng!]);
    const selRouteRaw: [number, number][] = selData.map(p => [p.lat!, p.lng!]);
    const fullRoute = downsampleRoute(fullRouteRaw);
    const selRoute = downsampleRoute(selRouteRaw, 1000);
    const mapClickData = selData.length > 1 ? selData : gpsData;

    return (
        <>
            <MapContainer center={fullRoute[0]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={true} attributionControl={false} preferCanvas={true}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                <MapResizeHandler resizeSignal={mapResizeSignal} />
                <MapAutoFit positions={fullRoute} selectedPositions={selRoute} />
                <MapClickHandler gpsData={mapClickData} onPin={handlePin} />
                {/* Full route */}
                <Polyline positions={fullRoute} pathOptions={{ color: '#555', weight: 2, opacity: 0.6 }} />
                {/* Selected range */}
                {selRoute.length > 1 && (
                    <Polyline positions={selRoute} pathOptions={{ color: '#dc0000', weight: 3.5, opacity: 0.95 }} />
                )}
                {/* Start marker (green) */}
                {selData[0] && (
                    <CircleMarker center={[selData[0].lat!, selData[0].lng!]} radius={7}
                        pathOptions={{ color: '#fff', fillColor: '#22c55e', fillOpacity: 1, weight: 2 }} />
                )}
                {/* End marker (red) */}
                {selData.length > 1 && (
                    <CircleMarker center={[selData[selData.length - 1].lat!, selData[selData.length - 1].lng!]} radius={7}
                        pathOptions={{ color: '#fff', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }} />
                )}
                {/* Pinned point marker (gold) */}
                {pinnedPoint?.lat && Math.abs(pinnedPoint.lat) > 0.001 && pinnedPoint.lng && (
                    <CircleMarker center={[pinnedPoint.lat, pinnedPoint.lng]} radius={9}
                        pathOptions={{ color: '#fff', fillColor: '#f59e0b', fillOpacity: 1, weight: 2.5 }} />
                )}
                {/* Hovered point marker (cyan) */}
                {hoveredPoint?.lat && Math.abs(hoveredPoint.lat) > 0.001 && hoveredPoint.lng && (
                    <CircleMarker
                        center={[hoveredPoint.lat, hoveredPoint.lng]}
                        radius={6}
                        pathOptions={{ color: '#fff', fillColor: '#00b6d4', fillOpacity: 1, weight: 2 }}
                    />
                )}
            </MapContainer>
            <div className="ts-map-overlay">
                <span>{`Range points: ${selData.length}`}</span>
                <span className="ts-map-overlay-divider">•</span>
                <span>{`Route points: ${gpsData.length}`}</span>
                <span className="ts-map-overlay-divider">•</span>
                <span>Click map to pin nearest point</span>
            </div>
        </>
    );
}

// ============ Analysis Tab ============
function AnalysisTab({ rideId }: { rideId: string }) {
    const [analysis, setAnalysis] = useState<RideAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showRawData, setShowRawData] = useState(false);
    const [rawData, setRawData] = useState<any[] | null>(null);
    const [analysisTelemetry, setAnalysisTelemetry] = useState<TelemetryPoint[]>([]);
    const [selectedEventTimestamp, setSelectedEventTimestamp] = useState<string | null>(null);
    const [focusedEventPoint, setFocusedEventPoint] = useState<[number, number] | null>(null);

    useEffect(() => {
        setLoading(true);
        Promise.all([ridesApi.getAnalysis(rideId), ridesApi.getDetail(rideId)])
            .then(([analysisData, detail]) => {
                setAnalysis(analysisData);
                setError(null);

                const formattedTelemetry: TelemetryPoint[] =
                    (detail?.telemetry_blob ?? []).map((p: any, idx: number) => {
                        const timestampMs = getTimestampMsFromPoint(p) ?? Date.now() + idx;
                        const d = new Date(timestampMs);
                        const normalizedCoords = getLatLngFromPoint(p);
                        const mappedGear = getFirstNumeric(p, ['calculated_gear', 'gear']);
                        return {
                            ...p,
                            timestamp_ms: timestampMs,
                            lat: normalizedCoords?.[0],
                            lng: normalizedCoords?.[1],
                            pointKey: `${timestampMs}-${idx}`,
                            speed_kph: p.speed_kph || p.vehicle_speed_kph || 0,
                            rpm: p.engine_rpm || p.rpm || 0,
                            gear: mappedGear !== undefined ? Math.round(mappedGear) : undefined,
                            coolant_temp_c: getFirstNumeric(p, ['coolant_temp_c']),
                            timeLabel: `${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
                        };
                    });
                setAnalysisTelemetry(formattedTelemetry);
                setSelectedEventTimestamp(null);
                setFocusedEventPoint(null);
            })
            .catch(() => setError('Failed to load analysis data.'))
            .finally(() => setLoading(false));
    }, [rideId]);

    const handleRefreshAnalysis = async () => {
        setRefreshing(true);
        try {
            const refreshed = await ridesApi.getAnalysis(rideId, { forceRefresh: true });
            setAnalysis(refreshed);
            setError(null);
        } catch {
            setError('Failed to recalculate analysis data.');
        } finally {
            setRefreshing(false);
        }
    };

    const handleEventClick = useCallback((evt: AnalysisEventData) => {
        setSelectedEventTimestamp(evt.timestamp);

        if (typeof evt.lat === 'number' && typeof evt.lng === 'number') {
            setFocusedEventPoint([evt.lat, evt.lng]);
            return;
        }

        const candidates = analysisTelemetry.filter(
            (point) =>
                typeof point.lat === 'number' &&
                typeof point.lng === 'number' &&
                Math.abs(point.lat) > 0.001 &&
                Math.abs(point.lng) > 0.001 &&
                Number.isFinite(point.timestamp_ms),
        );

        if (!candidates.length) {
            setFocusedEventPoint(null);
            return;
        }

        const sortedCandidates = [...candidates].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
        const telemetryMinMs = sortedCandidates[0].timestamp_ms;
        const telemetryMaxMs = sortedCandidates[sortedCandidates.length - 1].timestamp_ms;
        const telemetrySpanMs = Math.max(1, telemetryMaxMs - telemetryMinMs);

        const directEventMs = normalizeTimestampMs(evt.timestamp);

        let targetMs: number | null = null;
        if (directEventMs !== null) {
            const lowerGuard = telemetryMinMs - telemetrySpanMs * 0.5;
            const upperGuard = telemetryMaxMs + telemetrySpanMs * 0.5;
            if (directEventMs >= lowerGuard && directEventMs <= upperGuard) {
                targetMs = directEventMs;
            }
        }

        if (targetMs === null && analysis?.events?.length && directEventMs !== null) {
            const parsedEventTimes = analysis.events
                .map((eventItem) => normalizeTimestampMs(eventItem.timestamp))
                .filter((value): value is number => value !== null)
                .sort((a, b) => a - b);

            if (parsedEventTimes.length >= 2) {
                const eventMinMs = parsedEventTimes[0];
                const eventMaxMs = parsedEventTimes[parsedEventTimes.length - 1];
                const eventSpanMs = eventMaxMs - eventMinMs;

                if (eventSpanMs > 0) {
                    const ratio = Math.max(0, Math.min(1, (directEventMs - eventMinMs) / eventSpanMs));
                    targetMs = telemetryMinMs + ratio * telemetrySpanMs;
                }
            }
        }

        if (targetMs === null && Number.isFinite(evt.speed_kph)) {
            let nearestBySpeed = sortedCandidates[0];
            let bestSpeedDiff = Math.abs((nearestBySpeed.speed_kph ?? 0) - evt.speed_kph);

            for (let index = 1; index < sortedCandidates.length; index++) {
                const candidate = sortedCandidates[index];
                const speedDiff = Math.abs((candidate.speed_kph ?? 0) - evt.speed_kph);
                if (speedDiff < bestSpeedDiff) {
                    nearestBySpeed = candidate;
                    bestSpeedDiff = speedDiff;
                }
            }

            setFocusedEventPoint([nearestBySpeed.lat!, nearestBySpeed.lng!]);
            return;
        }

        if (targetMs === null) {
            setFocusedEventPoint([sortedCandidates[0].lat!, sortedCandidates[0].lng!]);
            return;
        }

        let nearest = sortedCandidates[0];
        let bestDiff = Math.abs(nearest.timestamp_ms - targetMs);

        for (let index = 1; index < sortedCandidates.length; index++) {
            const candidate = sortedCandidates[index];
            const diff = Math.abs(candidate.timestamp_ms - targetMs);
            if (diff < bestDiff) {
                nearest = candidate;
                bestDiff = diff;
            }
        }

        setFocusedEventPoint([nearest.lat!, nearest.lng!]);
    }, [analysisTelemetry, analysis?.events]);

    const handleViewRawData = async () => {
        setShowRawData(true);
        if (!rawData) {
            try {
                const detail = await ridesApi.getDetail(rideId);
                setRawData(detail?.telemetry_blob ?? []);
            } catch { setRawData([]); }
        }
    };

    const downloadJson = () => {
        if (!rawData) return;
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rawData, null, 2));
        const a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', 'ride_data.json');
        document.body.appendChild(a); a.click(); a.remove();
    };

    if (loading) {
        return (
            <div className="rp-center-msg rp-analysis-loading">
                <RefreshCcw size={24} className="ts-icon-spin" />
                <span>Building ride analytics cockpit...</span>
            </div>
        );
    }
    if (error) return <div className="rp-center-msg error">{error}</div>;
    if (!analysis) return <div className="rp-center-msg">No ride data found.</div>;

    const metrics = analysis.metrics;
    const events = analysis.events || [];
    const scorecards = {
        smoothness_score: analysis.scorecards?.smoothness_score ?? metrics.smoothness_score,
        efficiency_score: analysis.scorecards?.efficiency_score ?? metrics.efficiency_score,
        consistency_score: analysis.scorecards?.consistency_score ?? Math.max(0, Math.min(100, Math.round((metrics.smoothness_score ?? 70) * 0.65 + (metrics.efficiency_score ?? 70) * 0.35))),
        risk_index: analysis.scorecards?.risk_index ?? 0,
        estimated_time_loss_s: analysis.scorecards?.estimated_time_loss_s ?? (analysis.segment_analytics || []).reduce((sum, segment) => sum + (segment.time_delta_vs_best_s || 0), 0)
    };

    // Fix backend noisy risk score from GPS glitches
    const derivedRisk = Math.max(0, Math.min(100, Math.round(100 - (Number(scorecards.smoothness_score ?? 50) * 0.5 + Number(scorecards.consistency_score ?? 50) * 0.5))));
    if (scorecards.risk_index === 100 || scorecards.risk_index > 95 || scorecards.risk_index === 0) {
        scorecards.risk_index = derivedRisk;
    }

    const segmentAnalytics = (analysis.segment_analytics || []).map(seg => {
        let risk = seg.risk_score_0_100 || 0;
        let decel = seg.peak_decel_mps2 || 0;
        // Filter out absurd peak decel noise (anything > 2.5G ~ 25m/s2 is likely an IMU/GPS glitch)
        if (Math.abs(decel) > 25) {
            risk = Math.max(0, Math.min(100, Math.round(derivedRisk + (seg.time_delta_vs_best_s || 0) * 1.5)));
        }
        return { ...seg, risk_score_0_100: risk };
    });

    const coaching = analysis.coaching;
    const worstSegment = segmentAnalytics.length
        ? [...segmentAnalytics].sort((a, b) => (b.time_delta_vs_best_s || 0) - (a.time_delta_vs_best_s || 0))[0]
        : null;
    const riskHotspotSegment = segmentAnalytics.length
        ? [...segmentAnalytics].sort((a, b) => (b.risk_score_0_100 || 0) - (a.risk_score_0_100 || 0))[0]
        : null;

    const formatIssueLabel = (issue?: string) => issue ? issue.replace(/_/g, ' ') : 'N/A';
    const paceInputs = [scorecards.smoothness_score, scorecards.efficiency_score, scorecards.consistency_score]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    const paceIndex = paceInputs.length
        ? Math.round(paceInputs.reduce((sum, value) => sum + value, 0) / paceInputs.length)
        : null;
    const sessionMode = paceIndex === null
        ? 'Data Pending'
        : paceIndex >= 80
            ? 'Attack Mode'
            : paceIndex >= 60
                ? 'Race Pace'
                : 'Recovery Mode';

    const throttleDelaySamples = segmentAnalytics
        .map((segment) => Number(segment.throttle_delay_ms))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 4000)
        .sort((a, b) => a - b);
    const throttleDelayMedianMs = throttleDelaySamples.length
        ? throttleDelaySamples[Math.floor(throttleDelaySamples.length / 2)]
        : null;

    const rawEstimatedTimeLoss = Math.max(0, Number(scorecards.estimated_time_loss_s ?? 0));
    // Use a smooth logarithmic scale so large totals do not immediately collapse to 0.
    const normalizedTimeLoss = Math.max(0, Math.min(100, Math.round(100 - Math.min(100, Math.log1p(rawEstimatedTimeLoss) * 18))));
    const scoreRows = [
        { label: 'Smoothness', value: Number(scorecards.smoothness_score ?? 0) },
        { label: 'Efficiency', value: Number(scorecards.efficiency_score ?? 0) },
        { label: 'Consistency', value: Number(scorecards.consistency_score ?? 0) },
        { label: 'Risk Control', value: 100 - Number(scorecards.risk_index ?? 0) },
        { label: 'Time-Loss Control', value: normalizedTimeLoss },
    ].map((row) => ({
        ...row,
        value: Math.max(0, Math.min(100, Math.round(row.value))),
    }));

    return (
        <div className="ra-shell">
            <section className="ra-topbar">
                <span className="ra-topbar-label">Telemetry racecraft intelligence</span>
                <div className="ra-topbar-actions">
                    <button className="ra-btn" onClick={handleRefreshAnalysis} disabled={refreshing}>
                        <RefreshCcw size={15} className={refreshing ? 'ts-icon-spin' : ''} style={{ marginRight: '0.42rem' }} />
                        {refreshing ? 'Recalculating...' : 'Refresh Analysis'}
                    </button>
                    <button className="ra-btn" onClick={handleViewRawData}>View Raw Data</button>
                </div>
            </section>

            <section className="ra-hero">
                <div className="ra-hero-copy">
                    <span className="ra-eyebrow">RIDE PERFORMANCE DECK</span>
                    <h3>Racecraft Diagnostic</h3>
                    <p>{analysis.summary || 'Telemetry summary unavailable for this ride.'}</p>
                </div>
                <div className="ra-hero-stats">
                    <article className="ra-hero-chip">
                        <span>Pace Index</span>
                        <strong>{paceIndex ?? '—'}</strong>
                    </article>
                    <article className="ra-hero-chip">
                        <span>Risk Index</span>
                        <strong>{Math.round(scorecards.risk_index ?? 0)}</strong>
                    </article>
                    <div className="ra-hero-mode">{sessionMode}</div>
                </div>
            </section>

            <section className="ra-priority-row">
                <article className="ra-panel">
                    <header className="ra-panel-head"><Shield size={18} /><h4>Scoreboard</h4></header>
                    <div className="ra-scoreboard">
                        {scoreRows.map((row) => (
                            <div key={row.label} className="ra-score-row">
                                <div className="ra-score-row-head">
                                    <span>{row.label}</span>
                                    <strong>{row.value}</strong>
                                </div>
                                <div className="ra-score-track">
                                    <div className="ra-score-fill" style={{ width: `${row.value}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="ra-panel">
                    <header className="ra-panel-head"><AlertTriangle size={18} /><h4>Race Notes</h4></header>
                    <div className="ra-notes">
                        <div className="ra-note-card">
                            <span>Biggest Time Leak</span>
                            <strong>{worstSegment ? `${worstSegment.segment_id} · +${(worstSegment.time_delta_vs_best_s || 0).toFixed(2)}s` : 'N/A'}</strong>
                            <p>Primary issue: {formatIssueLabel(worstSegment?.primary_issue)}</p>
                        </div>
                        <div className="ra-note-card">
                            <span>Risk Hotspot</span>
                            <strong>{riskHotspotSegment ? `${riskHotspotSegment.segment_id} · ${Math.round(riskHotspotSegment.risk_score_0_100 || 0)}/100` : 'N/A'}</strong>
                            <p>Peak decel: {riskHotspotSegment ? `${(riskHotspotSegment.peak_decel_mps2 || 0).toFixed(2)} m/s²` : 'N/A'}</p>
                        </div>
                        <div className="ra-note-card">
                            <span>Throttle Discipline</span>
                            <strong>{throttleDelayMedianMs !== null ? `${Math.round(throttleDelayMedianMs)} ms median delay` : 'N/A'}</strong>
                            <p>Lower delay improves corner exit drive and lap consistency.</p>
                        </div>
                    </div>
                </article>
            </section>

            <section className="ra-analysis-row">
                <div className="ra-map-column">
                    <article className="ra-panel ra-map-panel ra-map-sticky">
                        <header className="ra-panel-head"><MapIcon size={18} /><h4>Track Map</h4></header>
                        <AnalysisMap segments={analysis.map_segments || []} focusedPoint={focusedEventPoint} />
                    </article>
                </div>

                <div className="ra-analysis-stack">
                    <article className="ra-panel ra-timeline-panel">
                        <header className="ra-panel-head"><Activity size={18} /><h4>Event Timeline</h4></header>
                        <EventTimeline
                            events={events}
                            onEventClick={handleEventClick}
                            selectedEventTimestamp={selectedEventTimestamp}
                        />
                    </article>

                    <article className="ra-panel">
                        <header className="ra-panel-head"><Gauge size={18} /><h4>Gear Usage</h4></header>
                        <GearUsageChart data={metrics.gear_analytics || []} />
                    </article>

                    <article className="ra-panel">
                        <header className="ra-panel-head"><BarChart2 size={18} /><h4>Segment Time Loss</h4></header>
                        <SegmentLeaderboard segments={segmentAnalytics} />
                    </article>
                </div>
            </section>

            <section className="ra-coaching-row">
                <article className="ra-panel ra-coaching-panel">
                    <header className="ra-panel-head"><Cpu size={18} /><h4>Coaching Plan</h4></header>
                    <CoachingPanel coaching={coaching} />
                </article>
            </section>

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
                            {rawData && rawData.length > 0 ? (
                                <div className="table-container">
                                    <table>
                                        <thead><tr>{Object.keys(rawData[0]).map(k => <th key={k}>{k}</th>)}</tr></thead>
                                        <tbody>
                                            {rawData.slice(0, 100).map((row, i) => (
                                                <tr key={i}>{Object.values(row).map((v: any, j) => <td key={j}>{typeof v === 'number' ? v.toFixed(2) : String(v)}</td>)}</tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {rawData.length > 100 && <div className="more-data-indicator">...and {rawData.length - 100} more rows</div>}
                                </div>
                            ) : <p>No data.</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============ Time Series AI Tab ============
function TimeSeriesTab({ rideId }: { rideId: string }) {
    const THINKING_FLOW = [
        'Selecting telemetry range',
        'Normalizing signals',
        'Analyzing ride dynamics',
        'Drafting coaching insights',
    ];

    const formatToolName = (toolName: string) =>
        toolName
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (ch) => ch.toUpperCase())
            .replace(/\s+/g, ' ')
            .trim();

    const formatStepTime = (timestamp?: number | null) => {
        if (!timestamp) return '—';
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const hasMcpToolTrace = (tools?: string[]) => (tools || []).some((tool) => /\bmcp\b/i.test(tool));
    const extractMcpToolNames = (tools?: string[]) =>
        (tools || [])
            .filter((tool) => /\bmcp\b/i.test(tool))
            .map((tool) => formatToolName(tool));

    const [telemetryData, setTelemetryData] = useState<TelemetryPoint[]>([]);
    const [loadingTelemetry, setLoadingTelemetry] = useState(true);
    const [telemetryError, setTelemetryError] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
    const inputMessageRef = useRef<HTMLInputElement | null>(null);
    const [isTyping, setIsTyping] = useState(false);
    const [layout, setLayout] = useState<LayoutMode>('chart');
    const [showSessions, setShowSessions] = useState(true);
    const [pinnedPoint, setPinnedPoint] = useState<TelemetryPoint | null>(null);
    const [hoveredPoint, setHoveredPoint] = useState<TelemetryPoint | null>(null);
    const [thinkingStepIndex, setThinkingStepIndex] = useState(0);
    const [thinkingStepTimes, setThinkingStepTimes] = useState<(number | null)[]>([]);
    const [lastToolsUsed, setLastToolsUsed] = useState<string[]>([]);
    const [lastProgressUpdates, setLastProgressUpdates] = useState<string[]>([]);
    const [lastProgressStepTimes, setLastProgressStepTimes] = useState<number[]>([]);
    const [showTracePanel, setShowTracePanel] = useState(true);
    const [personas] = useState<AiPersona[]>(() => {
        try {
            const stored = localStorage.getItem('ts_llm_personas');
            if (stored) return JSON.parse(stored);
        } catch (e) { }
        return [];
    });
    const [activePersonaId, setActivePersonaId] = useState<string>(
        localStorage.getItem('ts_llm_active_persona_id') || ''
    );

    // LLM provider / model selectors
    const [providers, setProviders] = useState<LlmProviderOption[]>([]);
    const [selectedProviderId, setSelectedProviderId] = useState<string>(
        localStorage.getItem('chat_llm_provider') || ''
    );
    const [selectedModel, setSelectedModel] = useState<string>(
        localStorage.getItem('chat_llm_model') || ''
    );

    const [chatNotification, setChatNotification] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const hoverPendingPointRef = useRef<TelemetryPoint | null>(null);
    const hoverTimerRef = useRef<number | null>(null);
    const hoveredPointKeyRef = useRef<string | null>(null);

    const { sessions, activeSession, activeSessionId, createSession, selectSession, deleteSession, addMessage } = useChatSessions(rideId);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages]);

    useEffect(() => {
        hoveredPointKeyRef.current = hoveredPoint?.pointKey ?? null;
    }, [hoveredPoint]);

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current !== null) {
                window.clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
            }
        };
    }, []);

    const commitHoveredPoint = useCallback(() => {
        hoverTimerRef.current = null;
        const point = hoverPendingPointRef.current;
        const nextKey = point?.pointKey ?? null;
        if (nextKey === hoveredPointKeyRef.current) return;
        setHoveredPoint(point ?? null);
    }, []);

    const handleChartHover = useCallback((point?: TelemetryPoint | null) => {
        hoverPendingPointRef.current = point ?? null;
        if (hoverTimerRef.current !== null) return;
        hoverTimerRef.current = window.setTimeout(commitHoveredPoint, 70);
    }, [commitHoveredPoint]);

    const focusFromElapsedToken = useCallback((elapsedToken: string) => {
        const elapsedSec = parseElapsedTokenToSeconds(elapsedToken);
        if (elapsedSec === null || telemetryData.length === 0) return;

        const baseTimestampMs = telemetryData[0].timestamp_ms;
        const targetTimestampMs = baseTimestampMs + elapsedSec * 1000;

        let nearestIndex = 0;
        let nearestDiff = Math.abs(telemetryData[0].timestamp_ms - targetTimestampMs);
        for (let index = 1; index < telemetryData.length; index++) {
            const diff = Math.abs(telemetryData[index].timestamp_ms - targetTimestampMs);
            if (diff < nearestDiff) {
                nearestDiff = diff;
                nearestIndex = index;
            }
        }

        const nearestPoint = telemetryData[nearestIndex];
        setPinnedPoint(nearestPoint);
        setHoveredPoint(nearestPoint);

        if (!timeRange || nearestIndex < timeRange.startIndex || nearestIndex > timeRange.endIndex) {
            const windowSize = 140;
            const startIndex = Math.max(0, nearestIndex - windowSize);
            const endIndex = Math.min(telemetryData.length - 1, nearestIndex + windowSize);
            setTimeRange({ startIndex, endIndex });
        }
    }, [telemetryData, timeRange]);

    useEffect(() => {
        if (!isTyping) return;

        const startedAt = Date.now();
        setThinkingStepIndex(0);
        setThinkingStepTimes(THINKING_FLOW.map((_, idx) => (idx === 0 ? startedAt : null)));
        const intervalId = window.setInterval(() => {
            setThinkingStepIndex((current) => {
                if (current >= THINKING_FLOW.length - 1) return current;
                const next = current + 1;
                setThinkingStepTimes((prev) => {
                    const copy = [...prev];
                    if (copy[next] == null) copy[next] = Date.now();
                    return copy;
                });
                return next;
            });
        }, 950);

        return () => window.clearInterval(intervalId);
    }, [isTyping]);

    useEffect(() => {
        setLoadingTelemetry(true);
        ridesApi.getDetail(rideId)
            .then(detail => {
                if (!detail.telemetry_blob?.length) { setTelemetryError('No telemetry data found.'); return; }
                const firstTimestampMs = (detail.telemetry_blob as any[])
                    .map((point) => getTimestampMsFromPoint(point))
                    .find((value) => typeof value === 'number' && Number.isFinite(value)) ?? null;

                const formatted: TelemetryPoint[] = detail.telemetry_blob.map((p: any, idx: number) => {
                    const timestampMs = getTimestampMsFromPoint(p) ?? Date.now() + idx;
                    const d = new Date(timestampMs);
                    const normalizedCoords = getLatLngFromPoint(p);
                    const mappedGear = getFirstNumeric(p, ['calculated_gear', 'gear']);
                    const elapsedLabel = firstTimestampMs !== null
                        ? formatElapsedLabel(timestampMs - firstTimestampMs)
                        : undefined;
                    return {
                        ...p,
                        timestamp_ms: timestampMs,
                        lat: normalizedCoords?.[0],
                        lng: normalizedCoords?.[1],
                        pointKey: `${timestampMs}-${idx}`,
                        speed_kph: p.speed_kph || p.vehicle_speed_kph || 0,
                        rpm: p.engine_rpm || p.rpm || 0,
                        gear: mappedGear !== undefined ? Math.round(mappedGear) : undefined,
                        coolant_temp_c: getFirstNumeric(p, ['coolant_temp_c']),
                        timeLabel: `${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`,
                        elapsedLabel,
                    };
                });
                setTelemetryData(formatted);
                setTimeRange({ startIndex: 0, endIndex: formatted.length - 1 });
                setPinnedPoint(null);
                setHoveredPoint(null);
            })
            .catch(() => setTelemetryError('Failed to load telemetry data.'))
            .finally(() => setLoadingTelemetry(false));
    }, [rideId]);

    const activePersona = useMemo(() => {
        return personas.find(p => p.id === activePersonaId) || personas[0] || null;
    }, [personas, activePersonaId]);

    useEffect(() => {
        if (activePersonaId) localStorage.setItem('ts_llm_active_persona_id', activePersonaId);
    }, [activePersonaId]);

    useEffect(() => {
        if (selectedProviderId) localStorage.setItem('chat_llm_provider', selectedProviderId);
    }, [selectedProviderId]);

    useEffect(() => {
        if (selectedModel) localStorage.setItem('chat_llm_model', selectedModel);
    }, [selectedModel]);

    // Fetch providers from backend
    useEffect(() => {
        ridesApi.getLlmProviders().then(res => {
            const list = res.providers || [];
            setProviders(list);
            if (!selectedProviderId && res.default_provider_id) {
                setSelectedProviderId(res.default_provider_id);
                const def = list.find(p => p.id === res.default_provider_id);
                if (def && !selectedModel) setSelectedModel(def.default_model);
            }
        }).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!timeRange || !telemetryData.length || isTyping) return;

        const rawInput = inputMessageRef.current?.value ?? '';
        if (!rawInput.trim()) return;

        const userQuery = rawInput.trim();
        if (inputMessageRef.current) inputMessageRef.current.value = '';

        const history = buildChatHistoryForRequest(activeSession?.messages || [], 12);

        // Inject pinned data point as context prefix
        const contextPrefix = pinnedPoint
            ? `[Context: pinned data point at ${pinnedPoint.timeLabel} — Speed: ${pinnedPoint.speed_kph.toFixed(1)} km/h, RPM: ${pinnedPoint.rpm}]\n\n`
            : '';
        const promptWithContext = contextPrefix + userQuery;

        // Display message shows only what user typed (not the injected context)
        const displayContent = pinnedPoint
            ? `📍 **@${pinnedPoint.timeLabel}** (Speed: ${pinnedPoint.speed_kph.toFixed(1)} km/h · RPM: ${pinnedPoint.rpm})\n\n${userQuery}`
            : userQuery;

        const userMsg: ChatMessage = { role: 'user', content: displayContent, timestamp: Date.now() };
        addMessage(userMsg);
        setPinnedPoint(null);
        setLastToolsUsed([]);
        setLastProgressUpdates([]);
        setLastProgressStepTimes([]);
        setChatNotification(null);
        setIsTyping(true);

        try {
            const startMs = telemetryData[timeRange.startIndex].timestamp_ms;
            const endMs = telemetryData[timeRange.endIndex].timestamp_ms;
            const lowQuotaMode = localStorage.getItem('low_quota_mode') === '1';
            const resolvedProvider = selectedProviderId || activePersona?.providerId || undefined;
            const resolvedModel = selectedModel || activePersona?.modelId || undefined;
            
            // Read global provider API keys from Settings page
            let globalApiKeys: Record<string, string> = {};
            try {
                const storedKeys = localStorage.getItem('ts_api_keys');
                if (storedKeys) globalApiKeys = JSON.parse(storedKeys);
            } catch (e) {
                console.error("Failed to parse ts_api_keys");
            }
            
            const apiKey = activePersona?.apiKey || (resolvedProvider ? globalApiKeys[resolvedProvider] : undefined) || undefined;
            
            const res = await ridesApi.chatWithTelemetry(rideId, {
                prompt: promptWithContext,
                start_time_ms: startMs,
                end_time_ms: endMs,
                llm_provider: resolvedProvider,
                llm_model: resolvedModel,
                system_prompt: activePersona?.rolePrompt || undefined,
                api_key: apiKey,
                low_quota_mode: lowQuotaMode,
                conversation_id: activeSessionId || undefined,
                history,
            });
            const rawTools = res.tools_used || [];
            const tools = rawTools.map(formatToolName);
            const mcpTools = extractMcpToolNames(rawTools);
            addMessage({
                role: 'assistant',
                content: res.answer,
                timestamp: Date.now(),
                toolsUsed: tools,
                mcpActive: hasMcpToolTrace(rawTools),
                mcpTools,
            });
            const progress = res.progress_updates || THINKING_FLOW;
            const baseTime = Date.now();
            const progressTimes = progress.map((_, index) => baseTime + index * 120);
            setLastToolsUsed(tools.length ? tools : ['Telemetry Window Selector', 'Signal Normalizer', 'Ride Signal Analyzer', 'AI Insight Generator']);
            setLastProgressUpdates(progress);
            setLastProgressStepTimes(progressTimes);
        } catch (err: any) {
            const errorMessage = err?.message || 'Failed to fetch response.';
            const retryAfter = err?.info?.retry_after_seconds;
            const provider = err?.info?.provider;
            const model = err?.info?.model;

            const notificationParts = [errorMessage];
            if (provider || model) {
                notificationParts.push(`Provider: ${provider || 'unknown'}${model ? ` · Model: ${model}` : ''}`);
            }
            if (retryAfter) {
                notificationParts.push(`Retry after ~${retryAfter}s or switch to another provider/model.`);
            }
            setChatNotification(notificationParts.join(' '));

            addMessage({
                role: 'assistant',
                content: `❌ ${errorMessage}${retryAfter ? `\n\nTip: wait ~${retryAfter}s or switch model/provider from the selector.` : ''}`,
                timestamp: Date.now(),
            });
        } finally {
            setIsTyping(false);
        }
    };

    const chartFlex = layout === 'chart' ? 2 : 1;
    const chatFlex = layout === 'chat' ? 2 : 1;
    const mapResizeSignal = `${layout}-${showSessions}-${chartFlex}-${chatFlex}`;
    const pointLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        telemetryData.forEach((point) => map.set(point.pointKey, point.timeLabel));
        return map;
    }, [telemetryData]);

    if (loadingTelemetry) return (
        <div className="rp-center-msg"><RefreshCcw size={24} className="ts-icon-spin" style={{ marginBottom: '0.5rem' }} /><span>Loading Telemetry...</span></div>
    );
    if (telemetryError) return <div className="rp-center-msg error">{telemetryError}</div>;

    return (
        <div className="ts-tab-shell">
            {/* Sub-header: layout & session controls */}
            <div className="ts-sub-header">
                <div className="ts-layout-toggle">
                    <button className={`ts-toggle-btn ${layout === 'chart' ? 'active' : ''}`} onClick={() => setLayout('chart')}><LayoutPanelLeft size={14} /> Chart</button>
                    <button className={`ts-toggle-btn ${layout === 'chat' ? 'active' : ''}`} onClick={() => setLayout('chat')}><MessageSquare size={14} /> Chat</button>
                </div>
                {!!personas.length && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <CustomSelect
                            value={activePersonaId || personas[0]?.id || ''}
                            options={personas.map(p => ({ value: p.id, label: p.name, subtitle: `${p.providerId} · ${p.modelId}` }))}
                            onChange={(nextPersonaId) => setActivePersonaId(nextPersonaId)}
                            className="ts-header-select"
                        />
                    </div>
                )}
                {timeRange && (
                    <span className="ts-badge">
                        Selected: {telemetryData[timeRange.startIndex]?.timeLabel} – {telemetryData[timeRange.endIndex]?.timeLabel}
                    </span>
                )}
                <button className="rp-btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setShowSessions(s => !s)}>
                    {showSessions ? 'Hide' : 'Show'} History
                </button>
            </div>

            <div className="ts-tab-body">
                {/* Sessions panel */}
                {showSessions && (
                    <div className="ts-sessions-panel">
                        <div className="ts-sessions-header">
                            <span>Chat Sessions</span>
                            <button className="ts-new-chat-btn" onClick={createSession} title="New chat"><Plus size={14} /></button>
                        </div>
                        <div className="ts-sessions-list">
                            {[...sessions].reverse().map(session => (
                                <div
                                    key={session.id}
                                    className={`ts-session-item ${session.id === activeSessionId ? 'active' : ''}`}
                                    onClick={() => selectSession(session.id)}
                                >
                                    <div className="ts-session-info">
                                        <span className="ts-session-name">{session.name}</span>
                                        <span className="ts-session-meta">
                                            <Clock size={10} /> {new Date(session.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                    <button
                                        className="ts-session-delete"
                                        onClick={e => { e.stopPropagation(); deleteSession(session.id); }}
                                        title="Delete session"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Chart + Chat split */}
                <div className="ts-split" style={{ flex: 1, overflow: 'hidden' }}>
                    {/* Chart */}
                    <div className="ts-chart-section" style={{ flex: chartFlex }}>
                        <div className="ts-chart-card">
                            <div className="ts-card-header">
                                <h3>Telemetry Timeline</h3>
                                {pinnedPoint ? (
                                    <div className="ts-pinned-badge">
                                        <MapPin size={10} />
                                        <span>@{pinnedPoint.timeLabel} · {pinnedPoint.speed_kph.toFixed(1)} km/h · {pinnedPoint.rpm} RPM</span>
                                        <button className="ts-pinned-badge-x" onClick={() => setPinnedPoint(null)} title="Unpin"><X size={10} /></button>
                                    </div>
                                ) : (
                                    <span className="ts-card-hint"><MapPin size={11} /> Click a point to pin context</span>
                                )}
                            </div>
                            <div className="ts-chart-wrapper">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={telemetryData}
                                        margin={{ top: 10, right: 16, left: 22, bottom: 8 }}
                                        style={{ cursor: 'crosshair' }}
                                        onMouseMove={(state: any) => {
                                            const point = state?.activePayload?.[0]?.payload as TelemetryPoint | undefined;
                                            handleChartHover(point ?? null);
                                        }}
                                        onMouseLeave={() => handleChartHover(null)}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} opacity={0.45} />
                                        <XAxis
                                            dataKey="pointKey"
                                            stroke="var(--text-muted)"
                                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                            tickMargin={8}
                                            minTickGap={24}
                                            tickFormatter={(value: string) => pointLabelMap.get(value) ?? ''}
                                        />
                                        <YAxis
                                            yAxisId="left"
                                            stroke="var(--accent-primary)"
                                            tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, dx: 26 }}
                                            tickMargin={0}
                                            width={46}
                                            domain={[0, 'auto']}
                                        />
                                        <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" tick={{ fill: '#f59e0b', fontSize: 11 }} domain={[0, 'auto']} />
                                        <YAxis yAxisId="gear" hide allowDecimals={false} domain={[0, 'auto']} />
                                        {timeRange && (
                                            <ReferenceArea
                                                x1={telemetryData[timeRange.startIndex]?.pointKey}
                                                x2={telemetryData[timeRange.endIndex]?.pointKey}
                                                fill="var(--accent-primary)"
                                                fillOpacity={0.08}
                                                ifOverflow="extendDomain"
                                            />
                                        )}
                                        {pinnedPoint && (
                                            <ReferenceLine
                                                x={pinnedPoint.pointKey}
                                                stroke="rgba(245, 158, 11, 0.9)"
                                                strokeDasharray="4 4"
                                                strokeWidth={1.4}
                                                ifOverflow="extendDomain"
                                            />
                                        )}
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(16, 20, 28, 0.96)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '10px',
                                                color: 'var(--text-primary)',
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.32)'
                                            }}
                                            labelStyle={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 4 }}
                                            itemStyle={{ fontSize: 12 }}
                                            formatter={(value: any, name?: string | number) => {
                                                const seriesName = String(name ?? 'Value');
                                                if (seriesName.includes('Speed')) return [`${Number(value).toFixed(1)} km/h`, seriesName];
                                                if (seriesName.includes('RPM')) return [Math.round(Number(value)).toString(), seriesName];
                                                if (seriesName.includes('Gear')) return [Math.round(Number(value)).toString(), seriesName];
                                                return [Number(value).toFixed(2), seriesName];
                                            }}
                                            labelFormatter={(_label: any, payload: readonly any[]) => {
                                                const point = payload?.[0]?.payload as TelemetryPoint | undefined;
                                                if (!point) return '';
                                                const elapsed = point.elapsedLabel ?? formatElapsedLabel(point.timestamp_ms - telemetryData[0].timestamp_ms);
                                                return `${point.timeLabel} • ${elapsed}`;
                                            }}
                                            cursor={{ stroke: 'rgba(0, 182, 212, 0.45)', strokeWidth: 1 }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '12px' }} iconSize={10} />
                                        <Line yAxisId="left" type="monotone" dataKey="speed_kph" name="Speed (km/h)" stroke="var(--accent-primary)" strokeWidth={2.3} dot={false} isAnimationActive={false}
                                            strokeLinecap="round" strokeLinejoin="round"
                                            activeDot={{
                                                r: 6, fill: 'var(--accent-primary)', stroke: 'white', strokeWidth: 2, cursor: 'pointer',
                                                onClick: (_e: any, payload: any) => { if (payload?.payload) setPinnedPoint(payload.payload as TelemetryPoint); }
                                            }} />
                                        <Line yAxisId="gear" type="stepAfter" dataKey="gear" name="Gear" stroke="#f97316" strokeWidth={1.8} dot={false} strokeDasharray="3 2" connectNulls={false} isAnimationActive={false} />
                                        <Line yAxisId="right" type="monotone" dataKey="rpm" name="RPM" stroke="#f59e0b" strokeWidth={2.15} dot={false} isAnimationActive={false}
                                            strokeLinecap="round" strokeLinejoin="round"
                                            activeDot={{
                                                r: 6, fill: '#f59e0b', stroke: 'white', strokeWidth: 2, cursor: 'pointer',
                                                onClick: (_e: any, payload: any) => { if (payload?.payload) setPinnedPoint(payload.payload as TelemetryPoint); }
                                            }} />
                                        {pinnedPoint && (
                                            <>
                                                <ReferenceDot
                                                    x={pinnedPoint.pointKey}
                                                    y={pinnedPoint.speed_kph}
                                                    yAxisId="left"
                                                    r={7}
                                                    fill="var(--accent-primary)"
                                                    stroke="#fff"
                                                    strokeWidth={2}
                                                    ifOverflow="extendDomain"
                                                />
                                                <ReferenceDot
                                                    x={pinnedPoint.pointKey}
                                                    y={pinnedPoint.rpm}
                                                    yAxisId="right"
                                                    r={7}
                                                    fill="#f59e0b"
                                                    stroke="#fff"
                                                    strokeWidth={2}
                                                    ifOverflow="extendDomain"
                                                />
                                            </>
                                        )}
                                        <Brush
                                            dataKey="pointKey"
                                            height={32}
                                            stroke="var(--border-color)"
                                            fill="var(--bg-secondary)"
                                            travellerWidth={10}
                                            tickFormatter={(value: string) => pointLabelMap.get(value) ?? ''}
                                            onChange={(r: any) => r && r.startIndex !== undefined && setTimeRange({ startIndex: r.startIndex, endIndex: r.endIndex })}
                                            startIndex={timeRange?.startIndex}
                                            endIndex={timeRange?.endIndex}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        {/* GPS Map below chart */}
                        <div className="ts-map-card">
                            <TelemetryMap
                                telemetryData={telemetryData}
                                timeRange={timeRange}
                                pinnedPoint={pinnedPoint}
                                hoveredPoint={hoveredPoint}
                                mapResizeSignal={mapResizeSignal}
                                setPinnedPoint={setPinnedPoint}
                            />
                        </div>
                    </div>

                    {/* Chat */}
                    <div className="ts-chat-section" style={{ flex: chatFlex }}>
                        <div className="ts-messages">
                            {(activeSession?.messages ?? []).map((msg, i) => (
                                <div key={i} className={`ts-msg-row ts-msg-${msg.role}`}>
                                    <div className={`ts-bubble ts-bubble-${msg.role}`}>
                                        {msg.role === 'assistant' && (
                                            <div className="ts-bubble-author">
                                                <span className="ts-bubble-author-main"><Cpu size={10} /> Raptor AI</span>
                                                {msg.mcpActive && (
                                                    <span
                                                        className="ts-mcp-indicator"
                                                        title={msg.mcpTools?.length
                                                            ? `MCP tools: ${msg.mcpTools.join(', ')}`
                                                            : 'MCP tools were called for this response'}
                                                    >
                                                        MCP Active
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <div className="ts-bubble-content">
                                            <ReactMarkdown
                                                components={{
                                                    a: ({ href, children }) => {
                                                        const elapsedToken = extractElapsedTokenFromMarkdownLink(href, children);
                                                        if (elapsedToken) {
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    className="ts-time-link"
                                                                    onClick={() => focusFromElapsedToken(elapsedToken)}
                                                                    title={`Jump to ${elapsedToken}`}
                                                                >
                                                                    {elapsedToken}
                                                                </button>
                                                            );
                                                        }
                                                        if (!href) return <span>{children}</span>;
                                                        return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                                                    }
                                                }}
                                            >
                                                {msg.role === 'assistant' ? enrichMessageWithTimeLinks(msg.content) : msg.content}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {isTyping && (
                                <div className="ts-msg-row ts-msg-assistant">
                                    <div className="ts-bubble ts-bubble-assistant ts-thinking-card">
                                        <div className="ts-thinking-header">
                                            <Cpu size={12} /> Thinking...
                                        </div>
                                        <div className="ts-thinking-steps">
                                            {THINKING_FLOW.map((step, stepIndex) => {
                                                const isDone = stepIndex < thinkingStepIndex;
                                                const isActive = stepIndex === thinkingStepIndex;
                                                return (
                                                    <div
                                                        key={step}
                                                        className={`ts-thinking-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
                                                    >
                                                        <span className="ts-thinking-dot" />
                                                        <span>{step}</span>
                                                        <span className="ts-step-time">{formatStepTime(thinkingStepTimes[stepIndex])}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="ts-input-area">
                            {chatNotification && (
                                <div style={{ marginBottom: '0.5rem', padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.5)', background: 'rgba(245, 158, 11, 0.12)', color: '#fcd34d', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
                                    <span>{chatNotification}</span>
                                    <button type="button" onClick={() => setChatNotification(null)} style={{ background: 'transparent', border: 'none', color: '#fcd34d', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
                                </div>
                            )}
                            {!!lastToolsUsed.length && (
                                <div className="ts-tools-panel">
                                    <div className="ts-tools-heading-row">
                                        <div className="ts-tools-heading">Tools used & progress</div>
                                        <button type="button" className="ts-collapse-btn" onClick={() => setShowTracePanel((prev) => !prev)}>
                                            {showTracePanel ? 'Collapse' : 'Expand'}
                                        </button>
                                    </div>
                                    {showTracePanel && (
                                        <>
                                            <div className="ts-tool-chips">
                                                {lastToolsUsed.map((tool) => (
                                                    <span key={tool} className="ts-tool-chip">{tool}</span>
                                                ))}
                                            </div>
                                            {!!lastProgressUpdates.length && (
                                                <div className="ts-progress-list">
                                                    {lastProgressUpdates.map((update, index) => (
                                                        <div key={`${update}-${index}`} className="ts-progress-item">
                                                            <span className="ts-progress-index">{index + 1}</span>
                                                            <span>{update}</span>
                                                            <span className="ts-progress-time">{formatStepTime(lastProgressStepTimes[index])}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                            {/* Pinned point chip */}
                            {pinnedPoint && (
                                <div className="ts-pinned-chip">
                                    <MapPin size={11} />
                                    <span>
                                        <strong>@{pinnedPoint.timeLabel}</strong>
                                        {` — Speed: ${pinnedPoint.speed_kph.toFixed(1)} km/h · RPM: ${pinnedPoint.rpm}`}
                                    </span>
                                    <button className="ts-pinned-dismiss" onClick={() => setPinnedPoint(null)} title="Remove context"><X size={11} /></button>
                                </div>
                            )}
                            {/* LLM selector row */}
                            <div className="rp-llm-row">
                                <span className="rp-llm-label">Model:</span>
                                {providers.length > 0 ? (
                                    <>
                                        <select
                                            className="rp-llm-select"
                                            value={selectedProviderId}
                                            onChange={e => {
                                                const pid = e.target.value;
                                                setSelectedProviderId(pid);
                                                const prov = providers.find(p => p.id === pid);
                                                setSelectedModel(prov?.default_model || '');
                                            }}
                                        >
                                            {providers.map(p => (
                                                <option key={p.id} value={p.id}>{p.label}</option>
                                            ))}
                                        </select>
                                        <span className="rp-llm-divider" />
                                        <select
                                            className="rp-llm-select"
                                            value={selectedModel}
                                            onChange={e => setSelectedModel(e.target.value)}
                                        >
                                            {(providers.find(p => p.id === selectedProviderId)?.models || []).map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </>
                                ) : (
                                    <span className="rp-llm-loading">Loading…</span>
                                )}
                            </div>

                            <form onSubmit={handleSend} className="ts-form">
                                <input
                                    ref={inputMessageRef}
                                    type="text"
                                    placeholder={pinnedPoint ? `Ask about @${pinnedPoint.timeLabel}...` : 'Ask about this data range...'}
                                    disabled={isTyping}
                                    className="ts-input"
                                />
                                <button type="submit" disabled={isTyping} className="ts-send-btn">
                                    <Send size={14} />
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============ RidePage Shell ============
export default function RidePage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState<Tab>('analysis');
    const [rideTitle, setRideTitle] = useState('Ride Details');
    const [editingTitle, setEditingTitle] = useState(false);
    const [draftTitle, setDraftTitle] = useState('');
    const [savingTitle, setSavingTitle] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!id) return;
        ridesApi.getDetail(id).then(d => { if (d?.title) setRideTitle(d.title); }).catch(() => { });
    }, [id]);

    const startEdit = () => {
        setDraftTitle(rideTitle);
        setEditingTitle(true);
        setTimeout(() => titleInputRef.current?.select(), 0);
    };

    const saveTitle = async () => {
        const trimmed = draftTitle.trim();
        if (!trimmed || trimmed === rideTitle) { setEditingTitle(false); return; }
        setSavingTitle(true);
        try {
            await ridesApi.updateTitle(id!, trimmed);
            setRideTitle(trimmed);
            setEditingTitle(false);
        } catch (err) {
            console.error('Failed to save title:', err);
            // Keep editing open so user can retry
        } finally {
            setSavingTitle(false);
        }
    };

    const handleTitleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') saveTitle();
        if (e.key === 'Escape') setEditingTitle(false);
    };

    useEffect(() => {
        const tabFromState = (location.state as { initialTab?: Tab } | null)?.initialTab;
        const tabFromQuery = new URLSearchParams(location.search).get('tab');
        if (tabFromState === 'timeseries' || tabFromQuery === 'timeseries') {
            setActiveTab('timeseries');
        }
    }, [location.search, location.state]);

    if (!id) return <div className="rp-center-msg">Ride ID missing.</div>;

    return (
        <div className="rp-shell">
            {/* Header */}
            <div className="rp-header">
                <button className="rp-back-btn" onClick={() => navigate('/dashboard')}>
                    <ArrowLeft size={18} />
                </button>
                <div className="rp-title-area">
                    {editingTitle ? (
                        <input
                            ref={titleInputRef}
                            className="rp-title-input"
                            value={draftTitle}
                            onChange={e => setDraftTitle(e.target.value)}
                            onBlur={saveTitle}
                            onKeyDown={handleTitleKey}
                            disabled={savingTitle}
                            maxLength={80}
                        />
                    ) : (
                        <h2 className="rp-title rp-title-editable" onClick={startEdit} title="Click to rename">
                            {rideTitle}
                            <span className="rp-title-pencil">✎</span>
                        </h2>
                    )}
                </div>
                <div className="rp-tabs">
                    <button
                        className={`rp-tab ${activeTab === 'analysis' ? 'active' : ''}`}
                        onClick={() => setActiveTab('analysis')}
                    >
                        <BarChart2 size={15} /> Analysis
                    </button>
                    <button
                        className={`rp-tab ${activeTab === 'timeseries' ? 'active' : ''}`}
                        onClick={() => setActiveTab('timeseries')}
                    >
                        <Cpu size={15} /> Time Series AI
                    </button>
                </div>
            </div>

            {/* Tab content */}
            <div className="rp-content">
                {activeTab === 'analysis' ? (
                    <div className="rp-scroll-wrapper">
                        <AnalysisTab rideId={id} />
                    </div>
                ) : (
                    <TimeSeriesTab rideId={id} />
                )}
            </div>

            <style>{`
                .rp-shell { display:flex; flex-direction:column; height:100vh; width:100vw; position:fixed; top:0; left:0; overflow:hidden; background:var(--bg-primary); color:var(--text-primary); z-index:100; }
                .rp-header {
                    flex: none;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.9rem 1.55rem;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                    background: linear-gradient(90deg, rgba(17,17,20,0.96), rgba(19,18,18,0.92));
                    backdrop-filter: blur(12px);
                }
                .rp-back-btn { background:none; border:none; color:var(--text-muted); cursor:pointer; padding:0.4rem; border-radius:8px; display:flex; align-items:center; transition:all 0.2s; }
                .rp-back-btn:hover { background:var(--bg-card); color:var(--text-primary); }
                .rp-title-area { flex:1; min-width:0; }
                .rp-title { margin:0; font-size:1.2rem; font-weight:700; color:var(--text-primary); letter-spacing:0.02em; }
                .rp-title-editable { cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; border-radius:5px; padding:0.15rem 0.4rem; transition:background 0.15s; }
                .rp-title-editable:hover { background:rgba(255,255,255,0.06); }
                .rp-title-pencil { font-style:normal; font-size:0.75rem; color:var(--text-muted); opacity:0; transition:opacity 0.15s; }
                .rp-title-editable:hover .rp-title-pencil { opacity:1; }
                .rp-title-input { background:var(--bg-card); border:1px solid var(--accent-primary); color:var(--text-primary); font-size:1rem; font-weight:600; padding:0.15rem 0.5rem; border-radius:6px; outline:none; width:min(400px,60vw); }
                .rp-title-input:disabled { opacity:0.6; }
                .rp-tabs { display:flex; gap:4px; background:rgba(255,255,255,0.02); padding:4px; border-radius:11px; border:1px solid rgba(255,255,255,0.1); }
                .rp-tab { display:flex; align-items:center; gap:6px; padding:0.5rem 1.05rem; border:none; border-radius:8px; background:transparent; color:var(--text-muted); cursor:pointer; font-size:0.9rem; font-weight:600; transition:all 0.2s; }
                .rp-tab.active { background:linear-gradient(135deg, #dc0000, #a90000); color:white; box-shadow:0 4px 12px rgba(220,0,0,0.35); }
                .rp-tab:not(.active):hover { background:var(--bg-secondary); color:var(--text-primary); }
                .rp-content { flex:1; overflow:hidden; display:flex; flex-direction:column; }
                .rp-scroll-wrapper { flex:1; overflow-y:auto; overflow-x:hidden; position:relative; }

                /* ---- Analysis tab styles ---- */
                .rp-center-msg { display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; color:var(--text-muted); gap:0.5rem; }
                .rp-center-msg.error { color:#ef4444; }
                .rp-analysis-loading { min-height:52vh; font-size:0.95rem; letter-spacing:0.02em; }
                .ra-shell {
                    --ra-surface-1: rgba(255,255,255,0.05);
                    --ra-surface-2: rgba(255,255,255,0.015);
                    --ra-border: rgba(255,255,255,0.09);
                    --ra-text-soft: #a1a1aa;
                    --ra-text-muted: #7b7b86;
                    padding: 1.6rem 1.8rem 2rem;
                    max-width: 1680px;
                    margin: 0 auto;
                    display: grid;
                    gap: 1rem;
                }
                .ra-topbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 0.8rem;
                }
                .ra-topbar-label {
                    font-size: 0.9rem;
                    letter-spacing: 0.13em;
                    text-transform: uppercase;
                    color: var(--ra-text-soft);
                    font-weight: 700;
                }
                .ra-topbar-actions {
                    display: inline-flex;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }
                .ra-btn {
                    border: 1px solid var(--ra-border);
                    background: linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
                    color: #dadade;
                    border-radius: 10px;
                    font-size: 0.98rem;
                    font-weight: 600;
                    padding: 0.62rem 1.1rem;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
                }
                .ra-btn:hover { border-color: rgba(220,0,0,0.45); color: #fff; transform: translateY(-1px); }
                .ra-btn:disabled { opacity: 0.65; cursor: not-allowed; transform: none; }

                .ra-hero {
                    border-radius: 18px;
                    border: 1px solid var(--ra-border);
                    padding: 1.4rem 1.55rem;
                    background:
                        radial-gradient(120% 140% at 100% 0%, rgba(220,0,0,0.23) 0%, rgba(220,0,0,0.08) 30%, transparent 65%),
                        linear-gradient(145deg, rgba(11,11,14,0.96), rgba(17,12,12,0.98));
                    box-shadow: 0 14px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07);
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    gap: 1rem;
                    align-items: center;
                }
                .ra-eyebrow {
                    font-size: 0.84rem;
                    letter-spacing: 0.15em;
                    text-transform: uppercase;
                    color: var(--ra-text-soft);
                    font-weight: 700;
                    margin-bottom: 0.35rem;
                    display: inline-block;
                }
                .ra-hero-copy h3 {
                    margin: 0;
                    font-size: 2.25rem;
                    line-height: 1.1;
                    font-weight: 700;
                    color: #f7f7f8;
                }
                .ra-hero-copy p {
                    margin: 0.78rem 0 0;
                    color: #b6b6c1;
                    font-size: 1.14rem;
                    max-width: 72ch;
                }
                .ra-hero-stats {
                    display: grid;
                    gap: 0.45rem;
                    justify-items: end;
                }
                .ra-hero-chip {
                    min-width: 130px;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 11px;
                    padding: 0.45rem 0.68rem;
                    background: rgba(0,0,0,0.22);
                    text-align: right;
                }
                .ra-hero-chip span {
                    display: block;
                    font-size: 0.78rem;
                    letter-spacing: 0.14em;
                    text-transform: uppercase;
                    color: var(--ra-text-soft);
                    font-weight: 700;
                }
                .ra-hero-chip strong {
                    display: block;
                    margin-top: 0.12rem;
                    font-size: 1.7rem;
                    color: #fff;
                    line-height: 1;
                    font-weight: 800;
                }
                .ra-hero-mode {
                    border: 1px solid rgba(220,0,0,0.58);
                    color: #fecaca;
                    background: rgba(220,0,0,0.15);
                    border-radius: 999px;
                    padding: 0.4rem 0.92rem;
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    letter-spacing: 0.14em;
                    font-weight: 700;
                }

                .ra-priority-row {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 1.05rem;
                    align-items: start;
                }
                .ra-analysis-row {
                    display: grid;
                    grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
                    gap: 1.05rem;
                    align-items: stretch;
                }
                .ra-map-column {
                    min-width: 0;
                    align-self: stretch;
                    position: relative;
                }
                .ra-analysis-stack {
                    display: grid;
                    gap: 1.05rem;
                    min-width: 0;
                }
                .ra-panel {
                    border: 1px solid var(--ra-border);
                    border-radius: 14px;
                    background: linear-gradient(168deg, var(--ra-surface-1), var(--ra-surface-2));
                    box-shadow: 0 10px 26px rgba(0,0,0,0.28);
                    padding: 1.05rem 1.08rem;
                    min-width: 0;
                }
                .ra-panel-head {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                    padding-bottom: 0.68rem;
                    margin-bottom: 0.82rem;
                    color: #d8d8df;
                }
                .ra-panel-head h4 {
                    margin: 0;
                    font-size: 1.07rem;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                    color: #e4e4e8;
                    font-weight: 700;
                }
                .ra-map-panel .analysis-map-container {
                    height: min(74vh, 620px) !important;
                    border-radius: 10px;
                    overflow: hidden;
                }
                .ra-map-sticky {
                    position: sticky;
                    top: 1rem;
                }
                .ra-timeline-panel {
                    min-height: 548px;
                }

                .ra-scoreboard {
                    display: grid;
                    gap: 0.6rem;
                }
                .ra-score-row {
                    display: grid;
                    gap: 0.34rem;
                }
                .ra-score-row-head {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                    gap: 0.5rem;
                    color: #d8d8de;
                    font-size: 0.98rem;
                    font-weight: 600;
                }
                .ra-score-row-head strong { font-size: 1.14rem; color: #fff; }
                .ra-score-track {
                    height: 7px;
                    border-radius: 999px;
                    background: rgba(0,0,0,0.35);
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .ra-score-fill {
                    height: 100%;
                    background: linear-gradient(90deg, rgba(220,0,0,0.7), #ff2b2b);
                    border-radius: 999px;
                }

                .ra-notes {
                    display: grid;
                    gap: 0.55rem;
                }
                .ra-note-card {
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 11px;
                    background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
                    padding: 0.72rem 0.78rem;
                    display: grid;
                    gap: 0.26rem;
                }
                .ra-note-card span {
                    color: var(--ra-text-soft);
                    font-size: 0.78rem;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                    font-weight: 700;
                }
                .ra-note-card strong {
                    font-size: 1.2rem;
                    color: #f5f5f7;
                    line-height: 1.25;
                }
                .ra-note-card p {
                    margin: 0;
                    color: #9aa0aa;
                    font-size: 0.94rem;
                    line-height: 1.32;
                }

                .ra-coaching-row {
                    margin-top: 1.05rem;
                }
                .ra-coaching-panel {
                    padding-top: 1.12rem;
                }

                .icon-box {
                    width: 38px;
                    height: 38px;
                    border-radius: 11px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 0.22rem;
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .icon-box.red { background: rgba(220,0,0,0.22); color: #ff5c5c; }
                .icon-box.orange { background: rgba(255,149,0,0.19); color: #ffb34d; }
                .icon-box.blue { background: rgba(42,104,255,0.2); color: #6ba6ff; }
                .icon-box.green { background: rgba(34,197,94,0.2); color: #6ee7a4; }
                .icon-box.purple { background: rgba(42,104,255,0.2); color: #6ba6ff; }

                @media (max-width: 1200px) {
                    .ra-priority-row { grid-template-columns: 1fr; }
                    .ra-analysis-row { grid-template-columns: 1fr; }
                    .ra-hero { grid-template-columns: 1fr; }
                    .ra-hero-stats { justify-items: start; }
                    .ra-coaching-row { margin-top: 0.85rem; }
                    .ra-map-sticky { position: relative; top: 0; }
                }
                @media (max-width: 900px) {
                    .ra-shell { padding: 1rem; }
                    .ra-topbar { flex-direction: column; align-items: flex-start; }
                    .ra-metrics-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                    .ra-map-panel .analysis-map-container { height: 420px !important; }
                }
                @media (max-width: 560px) {
                    .ra-metrics-strip { grid-template-columns: 1fr; }
                    .ra-map-panel .analysis-map-container { height: 320px !important; }
                }
                .modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;backdrop-filter:blur(4px);}
                .modal-content{background:var(--bg-secondary);width:90%;max-width:1000px;height:80vh;border-radius:12px;border:1px solid var(--border-color);display:flex;flex-direction:column;overflow:hidden;}
                .modal-header{padding:1.25rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;}
                .modal-header h3{margin:0;}
                .modal-actions{display:flex;gap:1rem;}
                .btn-download{background:var(--accent-primary);color:white;padding:0.4rem 0.9rem;border-radius:6px;border:none;cursor:pointer;}
                .btn-close{background:transparent;border:1px solid var(--border-color);padding:0.4rem 0.9rem;border-radius:6px;cursor:pointer;color:var(--text-secondary);}
                .modal-body{flex:1;overflow:hidden;padding:1.25rem;display:flex;flex-direction:column;}
                .table-container{flex:1;overflow:auto;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-tertiary);}
                table{min-width:100%;border-collapse:separate;border-spacing:0;font-size:0.83rem;}
                th{text-align:left;padding:0.7rem;background:var(--bg-secondary);position:sticky;top:0;z-index:10;color:var(--text-secondary);white-space:nowrap;font-weight:600;border-bottom:2px solid var(--border-color);}
                td{padding:0.55rem 0.7rem;border-bottom:1px solid var(--border-color);color:var(--text-muted);white-space:nowrap;background:var(--bg-card);}
                tr:hover td{background:rgba(255,255,255,0.04);}
                .more-data-indicator{padding:0.8rem;text-align:center;color:var(--text-muted);font-style:italic;}

                /* ---- Time Series tab styles ---- */
                .ts-tab-shell { display:flex; flex-direction:column; height:100%; overflow:hidden; }
                .ts-sub-header { flex:none; display:flex; align-items:center; gap:1rem; padding:0.7rem 1.25rem; border-bottom:1px solid var(--border-color); background:var(--bg-secondary); flex-wrap:wrap; }
                .ts-tab-body { flex:1; display:flex; overflow:hidden; }

                /* Sessions panel */
                .ts-sessions-panel { width:200px; flex:none; border-right:1px solid var(--border-color); display:flex; flex-direction:column; background:var(--bg-secondary); overflow:hidden; }
                .ts-sessions-header { display:flex; align-items:center; justify-content:space-between; padding:0.75rem 1rem; border-bottom:1px solid var(--border-color); font-size:0.78rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; }
                .ts-new-chat-btn { background:var(--accent-primary); color:white; border:none; width:22px; height:22px; border-radius:5px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
                .ts-sessions-list { flex:1; overflow-y:auto; padding:0.5rem; display:flex; flex-direction:column; gap:3px; }
                .ts-session-item { display:flex; align-items:center; gap:0.5rem; padding:0.5rem; border-radius:7px; cursor:pointer; transition:background 0.15s; border:1px solid transparent; }
                .ts-session-item:hover { background:var(--bg-card); }
                .ts-session-item.active { background:rgba(220,0,0,0.1); border-color:rgba(220,0,0,0.2); }
                .ts-session-info { flex:1; min-width:0; display:flex; flex-direction:column; }
                .ts-session-name { font-size:0.78rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .ts-session-meta { font-size:0.68rem; color:var(--text-muted); display:flex; align-items:center; gap:3px; margin-top:2px; }
                .ts-session-delete { background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px; border-radius:4px; display:flex; opacity:0; transition:opacity 0.15s; }
                .ts-session-item:hover .ts-session-delete { opacity:1; }
                .ts-session-delete:hover { color:#ef4444; }

                /* Chart + Chat split */
                .ts-split { display:flex; overflow:hidden; }
                .ts-chart-section { display:flex; flex-direction:column; padding:1.1rem; padding-bottom:0; border-right:1px solid var(--border-color); transition:flex 0.3s ease; overflow:hidden; gap:0.75rem; }
                .ts-chart-card { flex:0 0 55%; background:var(--bg-card); border-radius:10px; border:1px solid var(--border-color); display:flex; flex-direction:column; padding:1rem; overflow:hidden; min-height:0; }
                .ts-map-card { flex:0 0 calc(45% - 0.75rem); border-radius:10px; border:1px solid var(--border-color); overflow:hidden; position:relative; min-height:160px; margin-bottom:1.1rem; }
                .ts-map-no-gps { height:100%; display:flex; align-items:center; justify-content:center; gap:0.5rem; color:var(--text-muted); font-size:0.8rem; background:var(--bg-card); }
                .ts-map-overlay { position:absolute; left:10px; bottom:10px; z-index:20; display:flex; align-items:center; gap:6px; background:rgba(10,10,10,0.75); border:1px solid var(--border-color); border-radius:999px; padding:0.28rem 0.6rem; font-size:0.68rem; color:var(--text-muted); backdrop-filter:blur(4px); pointer-events:none; }
                .ts-map-overlay-divider { color:var(--text-muted); opacity:0.7; }
                /* Leaflet z-index fix */
                .ts-map-card .leaflet-pane { z-index:10 !important; }
                .ts-map-card .leaflet-top, .ts-map-card .leaflet-bottom { z-index:15 !important; }

                /* Recharts polish + remove click focus white box */
                .ts-chart-wrapper .recharts-wrapper,
                .ts-chart-wrapper .recharts-surface {
                    outline: none !important;
                }
                .ts-chart-wrapper .recharts-layer:focus,
                .ts-chart-wrapper .recharts-wrapper:focus,
                .ts-chart-wrapper .recharts-surface:focus {
                    outline: none !important;
                }
                .ts-chart-wrapper .recharts-cartesian-axis-tick-value {
                    opacity: 0.9;
                }
                .ts-chart-wrapper .recharts-legend-item-text {
                    color: var(--text-secondary) !important;
                    font-size: 0.82rem;
                }
                .ts-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-bottom:1px solid var(--border-color); padding-bottom:0.65rem; }
                .ts-card-header h3 { margin:0; font-size:0.9rem; color:var(--text-secondary); }
                .ts-chart-wrapper { flex:1; min-height:0; }
                .ts-chat-section { display:flex; flex-direction:column; background:var(--bg-secondary); transition:flex 0.3s ease; overflow:hidden; }
                .ts-messages { flex:1; overflow-y:auto; padding:1rem; display:flex; flex-direction:column; gap:0.85rem; }
                .ts-msg-row { display:flex; width:100%; }
                .ts-msg-user { justify-content:flex-end; }
                .ts-msg-assistant { justify-content:flex-start; }
                .ts-bubble { max-width:86%; padding:0.75rem 0.9rem; border-radius:12px; font-size:0.85rem; line-height:1.55; }
                .ts-bubble-user { background:rgba(0,182,212,0.12); border:1px solid rgba(0,182,212,0.25); color:white; border-bottom-right-radius:3px; }
                .ts-bubble-assistant { background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-secondary); border-bottom-left-radius:3px; }
                .ts-bubble-author { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:0.68rem; font-weight:700; color:var(--accent-primary); text-transform:uppercase; letter-spacing:0.4px; margin-bottom:0.4rem; }
                .ts-bubble-author-main { display:inline-flex; align-items:center; gap:4px; }
                .ts-mcp-indicator { font-size:0.62rem; font-weight:700; letter-spacing:0.35px; text-transform:uppercase; color:#fca5a5; border:1px solid rgba(220,0,0,0.45); background:rgba(220,0,0,0.14); border-radius:999px; padding:0.08rem 0.38rem; white-space:nowrap; cursor:help; }
                .ts-bubble-content p{margin:0 0 0.5em;} .ts-bubble-content p:last-child{margin:0;}
                .ts-bubble-content strong{color:var(--text-primary);font-weight:600;}
                .ts-bubble-content code{background:rgba(255,255,255,0.07);padding:0.1em 0.3em;border-radius:4px;font-family:monospace;font-size:0.83em;}
                .ts-bubble-content ul,.ts-bubble-content ol{margin:0.3em 0 0.5em 1.1em;padding:0;}
                .ts-bubble-content li{margin:0.2em 0;}
                .ts-time-link{display:inline-flex;align-items:center;margin:0 0.1rem;border:1px solid var(--accent-primary);background:rgba(0,182,212,0.12);color:var(--accent-primary);border-radius:999px;padding:0.04rem 0.45rem;font-size:0.8em;font-weight:600;cursor:pointer;}
                .ts-time-link:hover{filter:brightness(1.08);}
                .ts-typing{display:flex;gap:4px;align-items:center;justify-content:center;padding:0.75rem 1.1rem!important;}
                .ts-typing span{width:5px;height:5px;background:var(--text-muted);border-radius:50%;animation:ts-bounce 1.3s infinite ease-in-out both;}
                .ts-typing span:nth-child(1){animation-delay:-0.32s;} .ts-typing span:nth-child(2){animation-delay:-0.16s;}
                @keyframes ts-bounce{0%,80%,100%{transform:scale(0);}40%{transform:scale(1);}}
                .ts-thinking-card{padding:0.65rem 0.75rem!important;min-width:260px;}
                .ts-thinking-header{display:flex;align-items:center;gap:5px;font-size:0.72rem;font-weight:700;color:var(--accent-primary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:0.45rem;}
                .ts-thinking-steps{display:flex;flex-direction:column;gap:4px;}
                .ts-thinking-step{display:flex;align-items:center;gap:7px;font-size:0.77rem;color:var(--text-muted);}
                .ts-thinking-step.done{color:#22c55e;}
                .ts-thinking-step.active{color:var(--text-primary);}
                .ts-step-time{margin-left:auto;font-size:0.68rem;color:var(--text-muted);font-family:monospace;}
                .ts-thinking-dot{width:7px;height:7px;border-radius:50%;background:rgba(148,163,184,0.8);box-shadow:0 0 0 0 rgba(0,182,212,0.5);}
                .ts-thinking-step.done .ts-thinking-dot{background:#22c55e;}
                .ts-thinking-step.active .ts-thinking-dot{background:#00b6d4;animation:ts-pulse 1.2s infinite;}
                @keyframes ts-pulse{0%{box-shadow:0 0 0 0 rgba(0,182,212,0.45);}70%{box-shadow:0 0 0 8px rgba(0,182,212,0);}100%{box-shadow:0 0 0 0 rgba(0,182,212,0);}}
                .ts-card-hint{display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-muted);font-style:italic;}
                .ts-pinned-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(220,0,0,0.12);border:1px solid rgba(220,0,0,0.3);border-radius:6px;padding:0.22rem 0.55rem;font-size:0.72rem;color:var(--accent-primary);font-family:monospace;}
                .ts-pinned-badge span{color:var(--text-muted);}
                .ts-pinned-badge-x{background:none;border:none;color:rgba(220,0,0,0.5);cursor:pointer;padding:0 2px;display:flex;border-radius:3px;line-height:1;}
                .ts-pinned-badge-x:hover{color:#ef4444;background:rgba(239,68,68,0.1);}
                .ts-pinned-chip{display:flex;align-items:center;gap:6px;background:rgba(220,0,0,0.08);border:1px solid rgba(220,0,0,0.2);border-radius:7px;padding:0.35rem 0.65rem;margin-bottom:0.5rem;font-size:0.78rem;color:var(--accent-primary);}
                .ts-pinned-chip strong{color:var(--text-primary);}
                .ts-pinned-chip span{flex:1;color:var(--text-muted);}
                .ts-pinned-dismiss{background:none;border:none;color:var(--text-muted);cursor:pointer;padding:2px;display:flex;border-radius:4px;}
                .ts-pinned-dismiss:hover{color:#ef4444;background:rgba(239,68,68,0.1);}
                .ts-tools-panel{border:1px solid var(--border-color);background:var(--bg-secondary);border-radius:8px;padding:0.55rem 0.65rem;margin-bottom:0.5rem;display:grid;gap:0.45rem;}
                .ts-tools-heading-row{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;}
                .ts-tools-heading{font-size:0.68rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.45px;}
                .ts-collapse-btn{border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-muted);border-radius:6px;padding:0.14rem 0.5rem;font-size:0.68rem;cursor:pointer;}
                .ts-collapse-btn:hover{color:var(--text-primary);border-color:var(--accent-primary);}
                .ts-tool-chips{display:flex;flex-wrap:wrap;gap:0.35rem;}
                .ts-tool-chip{font-size:0.72rem;color:var(--text-primary);border:1px solid rgba(0,182,212,0.35);background:rgba(0,182,212,0.08);padding:0.16rem 0.45rem;border-radius:999px;}
                .ts-progress-list{display:grid;gap:0.28rem;}
                .ts-progress-item{display:flex;align-items:flex-start;gap:0.45rem;font-size:0.74rem;color:var(--text-muted);}
                .ts-progress-index{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;font-size:0.66rem;border-radius:50%;background:rgba(220,0,0,0.2);color:var(--accent-primary);font-weight:700;}
                .ts-progress-time{margin-left:auto;font-size:0.68rem;color:var(--text-muted);font-family:monospace;}
                .ts-input-area{padding:0.75rem 1rem;background:var(--bg-card);border-top:1px solid var(--border-color);}
                .rp-llm-row{display:flex;align-items:center;gap:0.5rem;background:#0f0f0f;border-top:1px solid var(--border-color);padding:0.35rem 1rem;flex-shrink:0;min-height:34px;overflow:hidden;width:100%;box-sizing:border-box;}
                .rp-llm-label{font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;white-space:nowrap;flex-shrink:0;}
                .rp-llm-select{background:#1a1a1a;border:1px solid #2a2a2a;color:#d4d4d8;font-size:0.76rem;cursor:pointer;outline:none;font-family:inherit;padding:0.2rem 0.45rem;border-radius:5px;min-width:0;max-width:160px;overflow:hidden;text-overflow:ellipsis;accent-color:#dc0000;}
                .rp-llm-select:focus{outline:none;border-color:#dc0000;box-shadow:none;}
                .rp-llm-select:hover{border-color:#dc0000;color:#fff;}
                .rp-llm-select option{background:#1a1a1a;color:#fff;}
                .rp-llm-divider{width:1px;height:14px;background:#2a2a2a;flex-shrink:0;}
                .rp-llm-loading{font-size:0.73rem;color:#71717a;font-style:italic;}
                .ts-form{position:relative;display:flex;align-items:center;}
                .ts-input{width:100%;background:var(--bg-primary);border:1px solid var(--border-color);color:var(--text-primary);padding:0.7rem 2.5rem 0.7rem 0.9rem;border-radius:9px;font-size:0.88rem;outline:none;transition:border-color 0.2s;}
                .ts-input:focus{border-color:var(--accent-primary);}
                .ts-input:disabled{opacity:0.5;cursor:not-allowed;}
                .ts-send-btn{position:absolute;right:0.4rem;background:var(--accent-primary);color:white;border:none;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;}
                .ts-send-btn:disabled{background:var(--border-color);color:var(--text-muted);cursor:not-allowed;}
                .ts-icon-spin{animation:ts-spin 1.8s linear infinite;color:var(--accent-primary);}
                @keyframes ts-spin{100%{transform:rotate(360deg);}}

                /* Layout toggle & badge */
                .ts-layout-toggle{display:flex;gap:3px;background:var(--bg-card);padding:3px;border-radius:9px;border:1px solid var(--border-color);}
                .ts-toggle-btn{display:flex;align-items:center;gap:5px;padding:0.3rem 0.7rem;border:none;border-radius:7px;background:transparent;color:var(--text-muted);cursor:pointer;font-size:0.8rem;font-weight:500;transition:all 0.2s;}
                .ts-toggle-btn.active{background:var(--accent-primary);color:white;}
                .ts-toggle-btn:not(.active):hover{background:var(--bg-secondary);color:var(--text-primary);}
                .ts-badge{background:rgba(0,182,212,0.1);color:var(--accent-primary);border:1px solid rgba(0,182,212,0.2);padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.72rem;font-family:monospace;white-space:nowrap;}
            `}</style>
        </div>
    );
}
