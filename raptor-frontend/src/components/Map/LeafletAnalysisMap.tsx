import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Tooltip, useMap, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon missing in Leaflet + Webpack/Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapSegment {
    start: number[];
    end: number[];
    color: string;
    speed: number;
    segment_id?: string;
    time_delta_vs_best_s?: number;
    risk_score_0_100?: number;
}

interface LeafletAnalysisMapProps {
    segments: MapSegment[];
    focusedPoint?: [number, number] | null;
}

const GOLDEN_ANGLE = 137.508;

const highContrastSegmentColor = (index: number) => {
    const hue = (index * GOLDEN_ANGLE) % 360;
    return `hsl(${hue.toFixed(1)}, 88%, 56%)`;
};

const colorBySegmentId = (segmentId?: string, fallback?: string) => {
    if (!segmentId) return fallback || '#22c55e';
    const numeric = Number(segmentId.replace(/[^0-9]/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) {
        return highContrastSegmentColor(numeric - 1);
    }
    let hash = 0;
    for (let i = 0; i < segmentId.length; i++) {
        hash = (hash * 31 + segmentId.charCodeAt(i)) >>> 0;
    }
    return highContrastSegmentColor(hash % 360);
};

// Component to auto-fit bounds
const BoundsFitter: React.FC<{ segments: MapSegment[] }> = ({ segments }) => {
    const map = useMap();

    useEffect(() => {
        if (segments.length === 0) return;

        const bounds = L.latLngBounds([]);
        segments.forEach(seg => {
            bounds.extend(seg.start as [number, number]);
            bounds.extend(seg.end as [number, number]);
        });

        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [segments, map]);

    return null;
};

const FocusPointFitter: React.FC<{ focusedPoint?: [number, number] | null }> = ({ focusedPoint }) => {
    const map = useMap();

    useEffect(() => {
        if (!focusedPoint) return;
        try {
            const currentZoom = map.getZoom();
            map.flyTo(focusedPoint, Math.max(currentZoom, 16), { duration: 0.45 });
        } catch {
            // ignore map transition errors
        }
    }, [focusedPoint, map]);

    return null;
};

const LeafletAnalysisMap: React.FC<LeafletAnalysisMapProps> = ({ segments, focusedPoint }) => {
    // Determine center (fallback if no segments)
    const center: [number, number] = segments.length > 0
        ? segments[0].start as [number, number]
        : [0, 0];

    return (
        <MapContainer
            center={center}
            zoom={13}
            style={{ height: '100%', width: '100%', borderRadius: '12px', background: '#222' }}
        >
            {/* Dark Matter Dark Theme Tiles */}
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {segments.map((seg, i) => (
                <Polyline
                    key={i}
                    positions={[seg.start as [number, number], seg.end as [number, number]]}
                    pathOptions={{ color: colorBySegmentId(seg.segment_id, seg.color), weight: 4, opacity: 1 }}
                >
                    <Tooltip sticky>
                        <div style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>
                            <div><strong>{seg.segment_id || `Segment ${i + 1}`}</strong></div>
                            <div>Speed: {seg.speed.toFixed(1)} km/h</div>
                            {typeof seg.time_delta_vs_best_s === 'number' && (
                                <div>Delta: +{seg.time_delta_vs_best_s.toFixed(2)}s</div>
                            )}
                            {typeof seg.risk_score_0_100 === 'number' && (
                                <div>Risk: {seg.risk_score_0_100}/100</div>
                            )}
                        </div>
                    </Tooltip>
                </Polyline>
            ))}

            {focusedPoint && (
                <CircleMarker
                    center={focusedPoint}
                    radius={8}
                    pathOptions={{ color: '#fff', fillColor: '#f59e0b', fillOpacity: 1, weight: 2.5 }}
                />
            )}

            <BoundsFitter segments={segments} />
            <FocusPointFitter focusedPoint={focusedPoint} />
        </MapContainer>
    );
};

export default LeafletAnalysisMap;
