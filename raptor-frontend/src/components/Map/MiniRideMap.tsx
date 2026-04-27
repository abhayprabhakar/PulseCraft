import React, { useEffect, useState, useRef } from 'react';
import { ridesApi } from '../../services/api';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Loader2, Map as MapIcon } from 'lucide-react';

const useOnScreen = (ref: React.RefObject<Element>, rootMargin = '0px') => {
    const [isIntersecting, setIntersecting] = useState(false);
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setIntersecting(true); // Don't unmount! lazy load once
            },
            { rootMargin }
        );
        if (ref.current) observer.observe(ref.current);
        return () => { observer.disconnect(); };
    }, [ref, rootMargin]);
    return isIntersecting;
};

const BoundsFitter: React.FC<{ segments: any[] }> = ({ segments }) => {
    const map = useMap();
    useEffect(() => {
        if (segments.length === 0) return;
        const bounds = L.latLngBounds([]);
        segments.forEach(seg => {
            if (seg.start) bounds.extend(seg.start as [number, number]);
            if (seg.end) bounds.extend(seg.end as [number, number]);
        });
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [60, 60], animate: false });
        }
    }, [segments, map]);
    return null;
};

interface MiniRideMapProps {
    rideId: string;
}

const MiniRideMap: React.FC<MiniRideMapProps> = ({ rideId }) => {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useOnScreen(ref, '400px'); // proactively fetch offscreen

    const [segments, setSegments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!inView) return;
        let mounted = true;
        ridesApi.getAnalysis(rideId).then(data => {
            if (mounted) {
                setSegments(data.map_segments || []);
                setLoading(false);
            }
        }).catch(() => {
            if (mounted) setLoading(false);
        });
        return () => { mounted = false; };
    }, [rideId, inView]);

    const showMapTiles = localStorage.getItem('grid_map_enabled') !== '0';

    const dotGrid = `#0b0b0b url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='1' cy='1' r='0.9' fill='rgba(255%2C255%2C255%2C0.06)'/%3E%3C/svg%3E") repeat`;

    return (
        <div ref={ref} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, borderRadius: '12px', overflow: 'hidden', background: !showMapTiles ? dotGrid : undefined }}>
            {(!inView || loading) ? (
                <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', background: '#1c1c1e' }}>
                    <Loader2 className="animate-spin" size={24} color="#555" />
                </div>
            ) : segments.length === 0 ? (
                <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', background: '#1c1c1e', color: '#555' }}>
                    <MapIcon size={24} />
                </div>
            ) : (
                <MapContainer
                    center={segments[0].start as [number, number] || [0,0]}
                    zoom={13}
                    style={{ height: '100%', width: '100%', background: 'transparent' }}
                    attributionControl={false}
                    zoomControl={false}
                    dragging={false}
                    scrollWheelZoom={false}
                    doubleClickZoom={false}
                    touchZoom={false}
                >
                    {showMapTiles && <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />}
                    {segments.map((seg, i) => (
                        <Polyline
                            key={i}
                            positions={[seg.start as [number, number], seg.end as [number, number]]}
                            pathOptions={{ color: '#ef4444', weight: 2.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
                        />
                    ))}
                    <BoundsFitter segments={segments} />
                </MapContainer>
            )}
            
            {/* Vignette Layer pushing shadows only on text top/bottom edges */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, 
                pointerEvents: 'none',
                background: 'linear-gradient(to bottom, rgba(15,15,15,0.95) 0%, rgba(15,15,15,0) 35%, rgba(15,15,15,0) 65%, rgba(15,15,15,0.9) 100%)'
            }} />
        </div>
    );
};

export default MiniRideMap;
