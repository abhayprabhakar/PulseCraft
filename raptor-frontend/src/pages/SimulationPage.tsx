import React from 'react';
import { SimulationProvider } from '../contexts/SimulationContext';
import Header from '../components/Header/Header';
import TrackMap from '../components/TrackMap/TrackMap';
import TelemetryDashboard from '../components/Telemetry/TelemetryDashboard';
import MetricsPanel from '../components/Metrics/MetricsPanel';
import PlaybackControls from '../components/Controls/PlaybackControls';
import '../App.css'; // Keep original styles for now

const SimulationPage: React.FC = () => {
    return (
        <SimulationProvider>
            <div className="app-container">
                <Header />
                <main className="main-content">
                    <TrackMap />
                    <TelemetryDashboard />
                    <MetricsPanel />
                </main>
                <PlaybackControls />
            </div>
        </SimulationProvider>
    );
};

export default SimulationPage;
