import React, { useEffect, useState, useRef } from 'react';
import { authApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, LogOut, Calendar, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UserStats } from '../types/user';

const ProfilePage: React.FC = () => {
    const { user, refreshProfile, logout } = useAuth();
    const navigate = useNavigate();

    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ full_name: '', email: '' });
    const [stats, setStats] = useState<UserStats | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user) {
            setEditForm({ full_name: user.full_name || '', email: user.email });
            fetchStats();
        }
    }, [user]);

    const fetchStats = async () => {
        try {
            const data = await authApi.getStats();
            setStats(data);
        } catch (error) {
            console.error("Failed to load stats", error);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleSave = async () => {
        try {
            await authApi.updateProfile(editForm);
            await refreshProfile();
            setIsEditing(false);
        } catch (err) {
            console.error("Failed to update profile", err);
            alert("Failed to update profile");
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            await authApi.uploadAvatar(file);
            await refreshProfile();
        } catch (error) {
            console.error("Failed to upload avatar", error);
            alert("Failed to upload avatar");
        }
    };

    const getAvatarUrl = (url?: string) => {
        if (!url) return null;
        const baseUrl = localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const cleanBaseUrl = baseUrl.replace('/api/v1', '');
        return url.startsWith('http') ? url : `${cleanBaseUrl}${url}`;
    };

    if (!user) return <div className="loading">Loading profile...</div>;

    return (
        <div className="profile-container">
            <div className="profile-content-wrapper">
                <div className="profile-card">
                    <div className="profile-header">
                        <div className="avatar-container">
                            {user.profile_picture_url ? (
                                <img src={getAvatarUrl(user.profile_picture_url)!} alt="Profile" className="avatar-img" />
                            ) : (
                                <div className="avatar-placeholder">
                                    {user.full_name?.charAt(0) || user.email.charAt(0)}
                                </div>
                            )}
                            <button className="btn-upload-avatar" onClick={() => fileInputRef.current?.click()}>
                                <Camera size={16} />
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleAvatarUpload}
                                style={{ display: 'none' }}
                                accept="image/*"
                            />
                        </div>

                        <h2>{user.full_name || 'Rider'}</h2>
                        <span className="role-badge">Pro Rider</span>
                        <button className="btn-edit-toggle" onClick={() => setIsEditing(!isEditing)}>
                            {isEditing ? 'Cancel' : 'Edit Profile'}
                        </button>
                    </div>

                    <div className="profile-details">
                        <div className="detail-item">
                            <Mail size={20} className="icon" />
                            <div>
                                <label>Email</label>
                                {isEditing ? (
                                    <input
                                        className="edit-input"
                                        value={editForm.email}
                                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                        disabled // Don't allow email change for now
                                    />
                                ) : (
                                    <p>{user.email}</p>
                                )}
                            </div>
                        </div>
                        <div className="detail-item">
                            <User size={20} className="icon" />
                            <div>
                                <label>Full Name</label>
                                {isEditing ? (
                                    <input
                                        className="edit-input"
                                        value={editForm.full_name}
                                        onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                                    />
                                ) : (
                                    <p>{user.full_name || 'Not set'}</p>
                                )}
                            </div>
                        </div>
                        <div className="detail-item">
                            <Calendar size={20} className="icon" />
                            <div>
                                <label>Member Since</label>
                                <p>{new Date(user.created_at).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>

                    <div className="profile-actions">
                        {isEditing ? (
                            <button onClick={handleSave} className="btn-save">
                                Save Changes
                            </button>
                        ) : (
                            <button onClick={handleLogout} className="btn-logout">
                                <LogOut size={18} />
                                Sign Out
                            </button>
                        )}
                    </div>
                </div>

                {stats && (
                    <div className="stats-card">
                        <h3>Career Statistics</h3>
                        <div className="stats-grid">
                            <div className="stat-box">
                                <span className="stat-value">{stats.total_rides}</span>
                                <span className="stat-label">Total Rides</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{stats.total_hours}h</span>
                                <span className="stat-label">Time Riding</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{stats.total_distance_km}</span>
                                <span className="stat-label">Distance (km)</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{stats.max_speed_kph}</span>
                                <span className="stat-label">Top Speed</span>
                            </div>
                            <div className="stat-box full-width">
                                <span className="stat-value">{stats.favorite_bike}</span>
                                <span className="stat-label">Favorite Bike</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .profile-container { padding: 2rem; display: flex; justify-content: center; }
                .profile-content-wrapper { display: flex; gap: 2rem; width: 100%; max-width: 900px; align-items: flex-start; flex-wrap: wrap; }
                
                .profile-card { flex: 1; min-width: 300px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; overflow: hidden; position: relative; }
                .profile-header { background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%); padding: 3rem 1rem; text-align: center; border-bottom: 1px solid var(--border-color); position: relative; }
                
                .avatar-container { position: relative; width: 100px; height: 100px; margin: 0 auto 1rem; }
                .avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 3px solid var(--accent-primary); box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
                .avatar-placeholder { width: 100%; height: 100%; background: var(--accent-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; font-weight: bold; color: white; border: 3px solid rgba(255,255,255,0.1); }
                
                .btn-upload-avatar { position: absolute; bottom: 0; right: 0; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
                .btn-upload-avatar:hover { background: var(--accent-primary); color: white; border-color: var(--accent-primary); }

                .profile-header h2 { margin: 0 0 0.5rem; color: var(--text-primary); }
                .role-badge { background: rgba(0, 255, 136, 0.1); color: var(--accent-secondary); padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
                
                .btn-edit-toggle { position: absolute; top: 1rem; right: 1rem; background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s; }
                .btn-edit-toggle:hover { color: var(--text-primary); border-color: var(--text-primary); }

                .profile-details { padding: 2rem; }
                .detail-item { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color); }
                .detail-item .icon { color: var(--text-muted); }
                .detail-item label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 2px; }
                .detail-item p { margin: 0; font-weight: 500; color: var(--text-primary); }
                
                .edit-input { background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.5rem; border-radius: 4px; width: 100%; font-size: 1rem; }
                .edit-input:focus { border-color: var(--accent-primary); outline: none; }
                .edit-input:disabled { opacity: 0.5; cursor: not-allowed; }

                .profile-actions { padding: 0 2rem 2rem; }
                .btn-logout { width: 100%; padding: 1rem; background: rgba(255, 77, 77, 0.1); color: #ff4d4d; border: 1px solid rgba(255, 77, 77, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s; font-weight: bold; }
                .btn-logout:hover { background: rgba(255, 77, 77, 0.2); }
                
                .btn-save { width: 100%; padding: 1rem; background: var(--accent-primary); color: #000; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.2s; }
                .btn-save:hover { opacity: 0.9; transform: translateY(-1px); }

                .stats-card { flex: 0 0 300px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; height: fit-content; }
                .stats-card h3 { margin: 0 0 1.5rem; color: var(--text-secondary); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; }
                .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
                .stat-box { background: var(--bg-secondary); padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
                .stat-box.full-width { grid-column: span 2; }
                .stat-value { font-size: 1.5rem; font-weight: bold; color: var(--text-primary); font-family: var(--font-heading); }
                .stat-label { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem; }

                @media (max-width: 800px) { .profile-content-wrapper { flex-direction: column; } .stats-card { width: 100%; } }
            `}</style>
        </div>
    );
};

export default ProfilePage;
