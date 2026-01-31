import React, { useRef, useEffect, useState } from 'react';
import { useSimulation } from '@/contexts/SimulationContext';
import {
    getPositionOnTrack,
    drawTrack,
    drawBike,
} from '@/utils/trackPath';
import { getSector } from '@/utils/formatters';
import './TrackMap.css';

const TrackMap: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { lapData, currentDataIndex, currentLapId, totalLaps } = useSimulation();

    // Zoom and pan state
    const [zoom, setZoom] = useState(1);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Resize canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const container = canvas.parentElement;
        if (!container) return;

        const resizeCanvas = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    // Mouse wheel zoom
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom(prev => Math.max(0.5, Math.min(5, prev * delta)));
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', handleWheel);
    }, []);

    // Mouse drag to pan
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPanX(e.clientX - dragStart.x);
        setPanY(e.clientY - dragStart.y);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Draw track and bike with zoom/pan
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || lapData.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Apply zoom and pan transformations
        ctx.save();
        ctx.translate(width / 2 + panX, height / 2 + panY);
        ctx.scale(zoom, zoom);
        ctx.translate(-width / 2, -height / 2);

        // Draw track
        drawTrack(ctx, width, height, 60, zoom);

        // Calculate bike position
        const progress = currentDataIndex / lapData.length;
        const position = getPositionOnTrack(progress);

        // Draw bike
        drawBike(ctx, position.x, position.y, position.angle, width, height, 60, zoom);

        ctx.restore();
    }, [lapData, currentDataIndex, zoom, panX, panY]);

    const progress = lapData.length > 0 ? currentDataIndex / lapData.length : 0;
    const sector = getSector(progress);

    const handleZoomIn = () => setZoom(prev => Math.min(5, prev * 1.2));
    const handleZoomOut = () => setZoom(prev => Math.max(0.5, prev / 1.2));
    const handleReset = () => {
        setZoom(1);
        setPanX(0);
        setPanY(0);
    };

    return (
        <section className="track-section">
            <div className="section-header">
                <h2>Track Map</h2>
                <div className="lap-counter">
                    <span className="label">LAP</span>
                    <span className="value">{currentLapId}</span>
                    <span className="total">/ {totalLaps}</span>
                </div>
            </div>
            <div
                className="track-container"
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
                <canvas ref={canvasRef} />
                <div className="track-overlay">
                    <div className="sector-info">
                        <span className="sector-label">SECTOR</span>
                        <span className="sector-value">{sector}</span>
                    </div>
                </div>
                <div className="zoom-controls">
                    <button className="zoom-btn" onClick={handleZoomIn} title="Zoom In">+</button>
                    <button className="zoom-btn" onClick={handleReset} title="Reset View">⟲</button>
                    <button className="zoom-btn" onClick={handleZoomOut} title="Zoom Out">−</button>
                    <div className="zoom-level">{Math.round(zoom * 100)}%</div>
                </div>
            </div>
        </section>
    );
};

export default TrackMap;
