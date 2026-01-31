import React from 'react';
import { useSimulation } from '@/contexts/SimulationContext';
import './Header.css';

const Header: React.FC = () => {
    const { apiConnected } = useSimulation();

    return (
        <header className="header">
            <div className="logo">
                <div className="logo-text">
                    <h1>RAPTOR</h1>
                    <p>Rider Analytics Platform</p>
                </div>
            </div>
            <div className="header-status">
                <div className={`status-indicator ${apiConnected ? 'active' : ''}`}></div>
                <span>{apiConnected ? 'API Connected' : 'API Offline'}</span>
            </div>
        </header>
    );
};

export default Header;
