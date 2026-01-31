/**
 * RAPTOR Track Simulation
 * Interactive motorcycle track visualization with real-time data from API
 */

const API_BASE_URL = 'http://localhost:8000';
let currentLapId = 1;
let lapData = [];
let currentDataIndex = 0;
let isPlaying = false;
let playbackSpeed = 1;
let animationFrameId = null;
let lastUpdateTime = 0;

// Canvas setup
const canvas = document.getElementById('trackCanvas');
const ctx = canvas.getContext('2d');

// Track path (Bezier curve points for realistic racing line)
const trackPath = [
    { x: 0.5, y: 0.1, control1: { x: 0.3, y: 0.1 }, control2: { x: 0.2, y: 0.2 } },  // Start straight
    { x: 0.15, y: 0.3, control1: { x: 0.1, y: 0.25 }, control2: { x: 0.1, y: 0.35 } }, // Right corner
    { x: 0.2, y: 0.5, control1: { x: 0.15, y: 0.45 }, control2: { x: 0.25, y: 0.5 } }, // Straight
    { x: 0.4, y: 0.6, control1: { x: 0.35, y: 0.55 }, control2: { x: 0.45, y: 0.65 } }, // Left corner
    { x: 0.6, y: 0.65, control1: { x: 0.55, y: 0.7 }, control2: { x: 0.65, y: 0.7 } }, // Straight
    { x: 0.8, y: 0.6, control1: { x: 0.75, y: 0.55 }, control2: { x: 0.85, y: 0.55 } }, // Right corner
    { x: 0.85, y: 0.4, control1: { x: 0.9, y: 0.45 }, control2: { x: 0.9, y: 0.35 } }, // Left corner
    { x: 0.7, y: 0.2, control1: { x: 0.75, y: 0.25 }, control2: { x: 0.65, y: 0.15 } }, // Straight back
    { x: 0.5, y: 0.1, control1: { x: 0.55, y: 0.1 }, control2: { x: 0.5, y: 0.1 } }   // Complete loop
];

let bikePosition = { x: 0.5, y: 0.1 };
let bikeAngle = 0;

/**
 * Initialize the simulation
 */
async function init() {
    setupCanvas();
    await fetchLapData(currentLapId);
    drawTrack();
    drawBike();
    setupEventListeners();
    updateAPIStatus(true);
}

/**
 * Setup canvas with proper sizing
 */
function setupCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    window.addEventListener('resize', () => {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        drawTrack();
        drawBike();
    });
}

/**
 * Fetch lap data from API
 */
async function fetchLapData(lapId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/simulation/data?lap_id=${lapId}`);
        if (!response.ok) throw new Error('Failed to fetch data');
        
        const result = await response.json();
        lapData = result.data;
        currentDataIndex = 0;
        
        // Fetch and display metrics
        await fetchLapMetrics(lapId);
        
        updateAPIStatus(true);
        console.log(`Loaded ${lapData.length} data points for lap ${lapId}`);
    } catch (error) {
        console.error('API Error:', error);
        updateAPIStatus(false);
        // Fallback to client-side simulation if API is offline
        generateFallbackData();
    }
}

/**
 * Fetch lap metrics from API
 */
async function fetchLapMetrics(lapId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/lap/${lapId}/metrics`);
        if (!response.ok) throw new Error('Failed to fetch metrics');
        
        const result = await response.json();
        updateMetricsDisplay(result.metrics);
    } catch (error) {
        console.error('Metrics API Error:', error);
    }
}

/**
 * Update metrics display
 */
function updateMetricsDisplay(metrics) {
    document.getElementById('metricThrottle').textContent = metrics.throttle_smoothness_index.toFixed(2);
    document.getElementById('metricMaxSpeed').textContent = `${metrics.max_speed_kmph.toFixed(1)} km/h`;
    document.getElementById('metricMaxLean').textContent = `${metrics.max_lean_deg.toFixed(1)}°`;
    document.getElementById('metricLateralRMS').textContent = metrics.lateral_accel_rms.toFixed(3);
}

/**
 * Update API status indicator
 */
function updateAPIStatus(connected) {
    const statusEl = document.getElementById('apiStatus');
    const dot = statusEl.querySelector('.status-dot');
    
    if (connected) {
        dot.style.background = '#00ff88';
        dot.style.boxShadow = '0 0 10px #00ff88';
        statusEl.querySelector('span:last-child').textContent = 'API Connected';
    } else {
        dot.style.background = '#ff3366';
        dot.style.boxShadow = '0 0 10px #ff3366';
        statusEl.querySelector('span:last-child').textContent = 'API Offline';
    }
}

/**
 * Generate fallback data if API is unavailable
 */
function generateFallbackData() {
    lapData = [];
    const numPoints = 4500; // ~90 seconds at 50Hz
    
    for (let i = 0; i < numPoints; i++) {
        const progress = i / numPoints;
        const t = i * 20; // 20ms intervals
        
        lapData.push({
            timestamp: t,
            speed_kmph: 80 + Math.sin(progress * Math.PI * 4) * 40 + Math.random() * 5,
            rpm: 6000 + Math.sin(progress * Math.PI * 4) * 4000,
            throttle_percent: 50 + Math.sin(progress * Math.PI * 4) * 30,
            lean_angle: Math.sin(progress * Math.PI * 8) * 35,
            accel_x: Math.random() * 2,
            accel_y: Math.sin(progress * Math.PI * 8) * 4,
            accel_z: 9.81,
            gyro_x: 0,
            gyro_y: 0,
            gyro_z: 0,
            latitude: 28.4595,
            longitude: 77.0266
        });
    }
}

/**
 * Draw the race track
 */
function drawTrack() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const w = canvas.width;
    const h = canvas.height;
    const padding = 60;
    
    // Draw track outline (outer boundary)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 40;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    for (let i = 0; i < trackPath.length; i++) {
        const point = trackPath[i];
        const x = padding + (point.x * (w - padding * 2));
        const y = padding + (point.y * (h - padding * 2));
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            const prev = trackPath[i - 1];
            const cp1x = padding + (prev.control2.x * (w - padding * 2));
            const cp1y = padding + (prev.control2.y * (h - padding * 2));
            const cp2x = padding + (point.control1.x * (w - padding * 2));
            const cp2y = padding + (point.control1.y * (h - padding * 2));
            
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        }
    }
    ctx.stroke();
    
    // Draw racing line (center)
    ctx.strokeStyle = 'rgba(255, 51, 102, 0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    
    ctx.beginPath();
    for (let i = 0; i < trackPath.length; i++) {
        const point = trackPath[i];
        const x = padding + (point.x * (w - padding * 2));
        const y = padding + (point.y * (h - padding * 2));
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            const prev = trackPath[i - 1];
            const cp1x = padding + (prev.control2.x * (w - padding * 2));
            const cp1y = padding + (prev.control2.y * (h - padding * 2));
            const cp2x = padding + (point.control1.x * (w - padding * 2));
            const cp2y = padding + (point.control1.y * (h - padding * 2));
            
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw start/finish line
    const startX = padding + (trackPath[0].x * (w - padding * 2));
    const startY = padding + (trackPath[0].y * (h - padding * 2));
    
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startX - 20, startY);
    ctx.lineTo(startX + 20, startY);
    ctx.stroke();
}

/**
 * Draw the motorcycle
 */
function drawBike() {
    const w = canvas.width;
    const h = canvas.height;
    const padding = 60;
    
    const x = padding + (bikePosition.x * (w - padding * 2));
    const y = padding + (bikePosition.y * (h - padding * 2));
    
    // Bike glow effect
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(255, 51, 102, 0.8)';
    
    // Draw bike as a circle with direction indicator
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Direction line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
        x + Math.cos(bikeAngle) * 20,
        y + Math.sin(bikeAngle) * 20
    );
    ctx.stroke();
    
    ctx.shadowBlur = 0;
}

/**
 * Get position on track path based on progress (0-1)
 */
function getPositionOnTrack(progress) {
    const totalSegments = trackPath.length - 1;
    const segment = progress * totalSegments;
    const segmentIndex = Math.floor(segment);
    const t = segment - segmentIndex;
    
    if (segmentIndex >= totalSegments) {
        return { ...trackPath[0], angle: 0 };
    }
    
    const p0 = trackPath[segmentIndex];
    const p1 = trackPath[segmentIndex + 1];
    
    // Cubic Bezier curve calculation
    const x = Math.pow(1-t, 3) * p0.x +
              3 * Math.pow(1-t, 2) * t * p0.control2.x +
              3 * (1-t) * Math.pow(t, 2) * p1.control1.x +
              Math.pow(t, 3) * p1.x;
              
    const y = Math.pow(1-t, 3) * p0.y +
              3 * Math.pow(1-t, 2) * t * p0.control2.y +
              3 * (1-t) * Math.pow(t, 2) * p1.control1.y +
              Math.pow(t, 3) * p1.y;
    
    // Calculate tangent for angle
    const dx = -3 * Math.pow(1-t, 2) * p0.x +
               3 * Math.pow(1-t, 2) * p0.control2.x - 6 * (1-t) * t * p0.control2.x +
               6 * (1-t) * t * p1.control1.x - 3 * Math.pow(t, 2) * p1.control1.x +
               3 * Math.pow(t, 2) * p1.x;
               
    const dy = -3 * Math.pow(1-t, 2) * p0.y +
               3 * Math.pow(1-t, 2) * p0.control2.y - 6 * (1-t) * t * p0.control2.y +
               6 * (1-t) * t * p1.control1.y - 3 * Math.pow(t, 2) * p1.control1.y +
               3 * Math.pow(t, 2) * p1.y;
    
    const angle = Math.atan2(dy, dx);
    
    return { x, y, angle };
}

/**
 * Update simulation based on current data point
 */
function updateSimulation() {
    if (lapData.length === 0) return;
    
    const dataPoint = lapData[currentDataIndex];
    
    // Update bike position on track
    const progress = currentDataIndex / lapData.length;
    const position = getPositionOnTrack(progress);
    bikePosition = { x: position.x, y: position.y };
    bikeAngle = position.angle;
    
    // Update telemetry display
    updateTelemetry(dataPoint);
    
    // Update progress bar
    const progressPercent = (progress * 100).toFixed(1);
    document.getElementById('progressFill').style.width = `${progressPercent}%`;
    document.getElementById('progressSlider').value = progressPercent;
    
    // Update sector display (simple 3-sector split)
    const sector = Math.floor(progress * 3) + 1;
    document.getElementById('sectorDisplay').textContent = Math.min(sector, 3);
    
    // Redraw
    drawTrack();
    drawBike();
}

/**
 * Update telemetry displays
 */
function updateTelemetry(data) {
    // Speed
    const speed = Math.round(data.speed_kmph);
    document.getElementById('speedValue').textContent = speed;
    document.getElementById('speedBar').style.width = `${(speed / 160) * 100}%`;
    
    // RPM
    const rpm = Math.round(data.rpm);
    document.getElementById('rpmValue').textContent = rpm.toLocaleString();
    document.getElementById('rpmBar').style.width = `${(rpm / 14000) * 100}%`;
    
    // Throttle
    const throttle = Math.round(data.throttle_percent);
    document.getElementById('throttleValue').textContent = throttle;
    document.getElementById('throttleBar').style.width = `${throttle}%`;
    
    // Lean Angle
    const lean = data.lean_angle.toFixed(1);
    document.getElementById('leanValue').textContent = lean;
    
    // Lean marker position (map -55 to 55 degrees to 0 to 100%)
    const leanPercent = ((parseFloat(lean) + 55) / 110) * 100;
    document.getElementById('leanMarker').style.left = `${leanPercent}%`;
    
    // G-Forces
    const gLat = (data.accel_y / 9.81).toFixed(2);
    const gLong = (data.accel_x / 9.81).toFixed(2);
    document.getElementById('gLateral').textContent = gLat;
    document.getElementById('gLongitudinal').textContent = gLong;
    
    // Lap Time
    const timeMs = data.timestamp;
    const minutes = Math.floor(timeMs / 60000);
    const seconds = Math.floor((timeMs % 60000) / 1000);
    const milliseconds = timeMs % 1000;
    document.getElementById('lapTime').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Animation loop
 */
function animate(timestamp) {
    if (!isPlaying) return;
    
    const deltaTime = timestamp - lastUpdateTime;
    const updateInterval = 20 / playbackSpeed; // Base 20ms (50Hz)
    
    if (deltaTime >= updateInterval) {
        currentDataIndex++;
        
        if (currentDataIndex >= lapData.length) {
            // Lap completed
            currentDataIndex = 0;
            pause();
            return;
        }
        
        updateSimulation();
        lastUpdateTime = timestamp;
    }
    
    animationFrameId = requestAnimationFrame(animate);
}

/**
 * Playback controls
 */
function play() {
    if (lapData.length === 0) return;
    
    isPlaying = true;
    lastUpdateTime = performance.now();
    
    document.getElementById('playIcon').style.display = 'none';
    document.getElementById('pauseIcon').style.display = 'block';
    
    animationFrameId = requestAnimationFrame(animate);
}

function pause() {
    isPlaying = false;
    
    document.getElementById('playIcon').style.display = 'block';
    document.getElementById('pauseIcon').style.display = 'none';
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
}

function reset() {
    pause();
    currentDataIndex = 0;
    updateSimulation();
}

function setPlaybackSpeed(speed) {
    playbackSpeed = speed;
    
    // Update active button
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

/**
 * Export functions
 */
async function exportCSV() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/export/csv?lap_id=${currentLapId}`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Export failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `raptor_lap_${currentLapId}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('CSV Export Error:', error);
        alert('Failed to export CSV. Make sure the API server is running.');
    }
}

async function exportJSON() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/export/json?lap_id=${currentLapId}`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Export failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `raptor_lap_${currentLapId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('JSON Export Error:', error);
        alert('Failed to export JSON. Make sure the API server is running.');
    }
}

/**
 * Event listeners
 */
function setupEventListeners() {
    // Playback controls
    document.getElementById('playPauseBtn').addEventListener('click', () => {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    });
    
    document.getElementById('resetBtn').addEventListener('click', reset);
    
    // Speed controls
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const speed = parseFloat(e.target.dataset.speed);
            setPlaybackSpeed(speed);
        });
    });
    
    // Progress slider
    document.getElementById('progressSlider').addEventListener('input', (e) => {
        const progress = parseFloat(e.target.value) / 100;
        currentDataIndex = Math.floor(progress * lapData.length);
        updateSimulation();
    });
    
    // Export buttons
    document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
    document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
}

// Initialize on page load
window.addEventListener('load', init);
