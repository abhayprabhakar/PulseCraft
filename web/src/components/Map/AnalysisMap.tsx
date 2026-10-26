import React, { useEffect, useRef, useState } from 'react';
import LeafletAnalysisMap from './LeafletAnalysisMap';
import { Map as MapIcon, Activity } from 'lucide-react';

interface MapSegment {
    start: number[];
    end: number[];
    color: string;
    speed: number;
    segment_id?: string;
    time_delta_vs_best_s?: number;
    risk_score_0_100?: number;
}

interface AnalysisMapProps {
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

const CanvasMap: React.FC<{ segments: MapSegment[]; focusedPoint?: [number, number] | null }> = ({
    segments,
    focusedPoint,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !segments.length) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const container = containerRef.current;
        if (container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }

        // Calculate bounds
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        segments.forEach(seg => {
            minLat = Math.min(minLat, seg.start[0], seg.end[0]);
            maxLat = Math.max(maxLat, seg.start[0], seg.end[0]);
            minLng = Math.min(minLng, seg.start[1], seg.end[1]);
            maxLng = Math.max(maxLng, seg.start[1], seg.end[1]);
        });

        // Add padding
        const padding = 0.0001;
        minLat -= padding; maxLat += padding;
        minLng -= padding; maxLng += padding;

        const latRange = maxLat - minLat;
        const lngRange = maxLng - minLng;
        const scale = Math.min(canvas.width / lngRange, canvas.height / latRange) * 0.9;

        const offsetX = (canvas.width - lngRange * scale) / 2;
        const offsetY = (canvas.height - latRange * scale) / 2;

        const project = (lat: number, lng: number) => {
            const x = (lng - minLng) * scale + offsetX;
            // Invert Y for screen coords
            const y = canvas.height - ((lat - minLat) * scale + offsetY);
            return { x, y };
        };

        // Draw segments
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;

        segments.forEach(seg => {
            const p1 = project(seg.start[0], seg.start[1]);
            const p2 = project(seg.end[0], seg.end[1]);

            ctx.beginPath();
            ctx.strokeStyle = colorBySegmentId(seg.segment_id, seg.color);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        });

        if (focusedPoint) {
            const marker = project(focusedPoint[0], focusedPoint[1]);
            ctx.beginPath();
            ctx.fillStyle = '#f59e0b';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.arc(marker.x, marker.y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

    }, [segments, focusedPoint]);

    return (
        <div className="canvas-map-container" ref={containerRef} style={{ width: '100%', height: '100%' }}>
            <canvas ref={canvasRef} />
            <div className="legend">
                <div className="legend-item"><span className="dot slow"></span> Slow</div>
                <div className="legend-item"><span className="dot fast"></span> Fast</div>
            </div>
        </div>
    );
};

const AnalysisMap: React.FC<AnalysisMapProps> = ({ segments, focusedPoint }) => {
    const [viewMode, setViewMode] = useState<'map' | 'track'>('map');

    if (!segments || segments.length === 0) {
        return <div className="map-placeholder">No GPS data for this ride.</div>;
    }

    return (
        <div className="analysis-map-container">
            <div className="map-controls">
                <button
                    className={`control-btn ${viewMode === 'map' ? 'active' : ''}`}
                    onClick={() => setViewMode('map')}
                    title="Satellite Map View"
                >
                    <MapIcon size={14} /> Map
                </button>
                <button
                    className={`control-btn ${viewMode === 'track' ? 'active' : ''}`}
                    onClick={() => setViewMode('track')}
                    title="Track Shape View"
                >
                    <Activity size={14} /> Track
                </button>
            </div>

            <div className="map-content">
                {viewMode === 'map' ? (
                    <LeafletAnalysisMap segments={segments} focusedPoint={focusedPoint} />
                ) : (
                    <CanvasMap segments={segments} focusedPoint={focusedPoint} />
                )}
            </div>

            <style>{`
                .analysis-map-container { 
                    width: 100%; 
                    height: 400px; 
                    background: var(--bg-card); 
                    border-radius: 12px; 
                    border: 1px solid var(--border-color); 
                    position: relative; 
                    overflow: hidden; 
                    display: flex;
                    flex-direction: column;
                }
                .map-controls {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    z-index: 1000;
                    display: flex;
                    background: rgba(0,0,0,0.8);
                    border-radius: 8px;
                    padding: 4px;
                    border: 1px solid rgba(255,255,255,0.1);
                    backdrop-filter: blur(4px);
                    gap: 4px;
                }
                .control-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: 500;
                }
                .control-btn:hover {
                    color: white;
                    background: rgba(255,255,255,0.1);
                }
                .control-btn.active {
                    background: var(--accent-primary);
                    color: white;
                }
                
                .map-content {
                    width: 100%;
                    height: 100%;
                }

                .map-placeholder { width: 100%; height: 400px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); background: var(--bg-card); border-radius: 12px; }
                
                /* Check if these are still needed for CanvasMap, they are scoped to it? No, global style block. */
                .legend { position: absolute; bottom: 20px; right: 20px; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 8px; backdrop-filter: blur(4px); pointer-events: none; }
                .legend-item { display: flex; align-items: center; gap: 8px; color: white; font-size: 0.8rem; margin-bottom: 4px; }
                .dot { width: 10px; height: 10px; border-radius: 50%; display: block; }
                .dot.slow { background: hsl(120, 100%, 50%); }
                .dot.fast { background: hsl(0, 100%, 50%); }
            `}</style>
        </div>
    );
};

export default AnalysisMap;
