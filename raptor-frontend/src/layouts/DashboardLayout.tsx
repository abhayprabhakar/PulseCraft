import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, User, Bike, ChevronRight, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/DashboardLayout.css';

const DashboardLayout: React.FC = () => {
    const { currentBike, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const garageTarget = currentBike ? `/garage/${currentBike.id}` : '/select-bike';

    const getAvatarUrl = (url?: string) => {
        if (!url) return null;
        const baseUrl = localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const cleanBaseUrl = baseUrl.replace('/api/v1', '');
        return url.startsWith('http') ? url : `${cleanBaseUrl}${url}`;
    };

    const getPageTitle = (pathname: string) => {
        if (pathname.startsWith('/rides/')) return 'Ride Details';
        if (pathname.startsWith('/garage/')) return 'My Garage';
        switch (pathname) {
            case '/dashboard': return 'Overview';
            case '/chatbot': return 'AI Coach';
            case '/profile': return 'Profile';
            case '/settings': return 'Settings';
            default: return 'RAPTOR Analytics';
        }
    };

    return (
        <div className="dashboard-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h2>RAPTOR</h2>
                    <span>ANALYTICS</span>
                </div>

                {/* Bike Profile Card */}
                <div className="bike-profile-card" onClick={() => navigate('/select-bike')}>
                    <div className="bike-icon">
                        {currentBike?.image_url ? (
                            <img src={getAvatarUrl(currentBike.image_url)!} alt={currentBike.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                            <Bike size={20} />
                        )}
                    </div>
                    <div className="bike-info">
                        <span className="bike-label">Current Ride</span>
                        <span className="bike-name">{currentBike?.name || "Select Bike"}</span>
                    </div>
                    <ChevronRight size={16} className="chevron" />
                </div>

                {/* Context-free top-level navigation only */}
                <nav className="sidebar-nav">
                    
                    <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <LayoutDashboard size={20} />
                        <span>Overview</span>
                    </NavLink>
                    <NavLink to="/chatbot" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <MessageSquare size={20} />
                        <span>AI Coach</span>
                    </NavLink>
                    <NavLink to={garageTarget} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Bike size={20} />
                        <span>My Garage</span>
                    </NavLink>
                    <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        {user?.profile_picture_url ? (
                            <img
                                src={getAvatarUrl(user.profile_picture_url)!}
                                alt="Profile"
                                style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--accent-primary)' }}
                            />
                        ) : <User size={20} />}
                        <span>Profile</span>
                    </NavLink>
                    <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Settings size={20} />
                        <span>Settings</span>
                    </NavLink>
                </nav>
            </aside>

            <main className="dashboard-content">
                <header className="top-bar">
                    <h1 className="page-title">{getPageTitle(location.pathname)}</h1>
                    <div className="user-profile" onClick={() => navigate('/settings')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{user?.full_name || user?.email || 'Rider'}</span>
                        {user?.profile_picture_url ? (
                            <img
                                src={getAvatarUrl(user.profile_picture_url)!}
                                alt="Profile"
                                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-primary)' }}
                            />
                        ) : (
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <User size={16} />
                            </div>
                        )}
                    </div>
                </header>
                <div className="content-area">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
