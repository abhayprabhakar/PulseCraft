import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Cpu, Edit2, LogOut, Save, Settings2, Trash2, User, Search, Download } from 'lucide-react';
import { authApi, checkConnection, LlmProviderOption, ridesApi, setBaseUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { UserStats } from '../types/user';

type SettingsSection = 'profile' | 'llm' | 'other';

const getProviderIcon = (id: string, size = 26) => {
    const i = id.toLowerCase();
    if (i.includes('anthropic')) return (
        <svg width={size} height={size} viewBox="0 0 256 176" fill="currentColor">
            <path d="m147.487 0l70.081 175.78H256L185.919 0zM66.183 106.221l23.98-61.774l23.98 61.774zM70.07 0L0 175.78h39.18l14.33-36.914h73.308l14.328 36.914h39.179L110.255 0z" />
        </svg>
    ); // Anthropic Official
    if (i.includes('google') || i.includes('gemini')) return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.545 10.239v3.821h5.445c-0.712 2.315-2.647 3.996-5.445 3.996-3.159 0-5.733-2.574-5.733-5.733s2.574-5.733 5.733-5.733c1.439 0 2.752 0.533 3.772 1.408l2.645-2.645c-1.688-1.579-3.921-2.544-6.417-2.544-5.253 0-9.52 4.267-9.52 9.52s4.267 9.52 9.52 9.52c4.959 0 8.853-3.468 8.853-8.853 0-0.612-0.088-1.229-0.228-1.758h-8.625z" />
        </svg>
    ); // Google Official generic
    if (i.includes('openai')) return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.282 9.821a6 6 0 0 0-.516-4.91a6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9a6.05 6.05 0 0 0 .743 7.097a5.98 5.98 0 0 0 .51 4.911a6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206a6 6 0 0 0 3.997-2.9a6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081l4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085l4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354l-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085l-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365l2.602-1.5l2.607 1.5v2.999l-2.597 1.5l-2.607-1.5Z"/>
        </svg>
    ); // OpenAI Official
    if (i.includes('mistral')) return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20L12 4L20 20M12 11V20" />
        </svg>
    ); // Sharp Mistral custom
    if (i.includes('groq')) return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.86 0 3.61-.51 5.11-1.39l-1.42-1.42A7.95 7.95 0 0 1 12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8c0 1.25-.29 2.43-.8 3.48l1.52 1.52c.81-1.47 1.28-3.17 1.28-5 0-5.52-4.48-10-10-10zm0 4a6 6 0 0 0-6 6c0 1.34.46 2.58 1.23 3.55l8.32-8.32A5.94 5.94 0 0 0 12 6z" />
        </svg>
    ); // Neat solid custom ring
    if (i.includes('deepseek')) return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.748 4.651c-.254-.124-.364.113-.512.233c-.051.04-.094.09-.137.137c-.372.397-.806.657-1.373.626c-.829-.046-1.537.214-2.163.848c-.133-.782-.575-1.248-1.247-1.548c-.352-.155-.708-.311-.955-.65c-.172-.24-.219-.509-.305-.774c-.055-.16-.11-.323-.293-.35c-.2-.031-.278.136-.356.276c-.313.572-.434 1.202-.422 1.84c.027 1.436.633 2.58 1.838 3.393c.137.094.172.187.129.323c-.082.28-.18.553-.266.833c-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836c.27-.098.094-.433-.778-.428c-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136a9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653c1.857 1.533 3.997 2.284 6.438 2.14c1.482-.085 3.132-.284 4.994-1.86c.47.234.962.328 1.78.398c.629.058 1.235-.031 1.705-.129c.735-.155.684-.836.418-.961c-2.155-1.004-1.682-.595-2.112-.926c1.095-1.295 2.768-3.598 3.284-6.733c.05-.346.115-.834.108-1.114c-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517c.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16c-.39.024-.32.472-.234.763c.09.288.207.487.371.74c.114.167.192.416-.113.603c-.673.416-1.842-.14-1.897-.168c-1.361-.801-2.5-1.86-3.301-3.306c-.775-1.393-1.225-2.888-1.299-4.482c-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774c.868.86 1.525 1.887 2.202 2.89c.72 1.066 1.494 2.082 2.48 2.915c.348.291.626.513.892.677c-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287a.3.3 0 0 1 .113.074a.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727c-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078a.253.253 0 0 1-.114-.358a1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016c.352.144.618.408 1.001.782c.392.451.462.576.685.915c.176.264.336.536.446.848c.066.194-.02.353-.25.45" />
        </svg>
    ); // DeepSeek Official
    return <Cpu size={size} />;
};

const SettingsPage: React.FC = () => {
    const { user, refreshProfile, logout } = useAuth();
    const navigate = useNavigate();

    const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

    // Profile
    const [profileStats, setProfileStats] = useState<UserStats | null>(null);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ full_name: '', email: '' });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // LLM / Providers
    const [providerLoading, setProviderLoading] = useState(false);
    const [llmSearchQuery, setLlmSearchQuery] = useState('');
    const [shareAnalytics, setShareAnalytics] = useState(true);
    const [providerError, setProviderError] = useState<string | null>(null);
    const [providers, setProviders] = useState<LlmProviderOption[]>([]);
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => {
        try {
            const stored = localStorage.getItem('ts_api_keys');
            if (stored) return JSON.parse(stored);
        } catch { }
        return {};
    });
    const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
    const [editApiKey, setEditApiKey] = useState('');

    // Other
    const [lowQuotaMode, setLowQuotaMode] = useState(localStorage.getItem('low_quota_mode') === '1');
    const [gridMapEnabled, setGridMapEnabled] = useState(localStorage.getItem('grid_map_enabled') !== '0');
    const [apiUrl, setApiUrl] = useState(
        localStorage.getItem('api_url') || (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000'
    );
    const [apiMessage, setApiMessage] = useState<string | null>(null);
    const [testingApi, setTestingApi] = useState(false);

    useEffect(() => {
        if (user) {
            setEditForm({ full_name: user.full_name || '', email: user.email });
        }
    }, [user]);

    useEffect(() => {
        if (activeSection === 'profile') {
            authApi.getStats()
                .then(setProfileStats)
                .catch(console.error);
        }
    }, [activeSection]);

    useEffect(() => {
        setProviderLoading(true);
        ridesApi.getLlmProviders()
            .then((data) => setProviders(data.providers || []))
            .catch((err: any) => setProviderError(err?.message || 'Failed to load providers.'))
            .finally(() => setProviderLoading(false));
    }, []);

    // Save api keys on change
    useEffect(() => {
        localStorage.setItem('ts_api_keys', JSON.stringify(apiKeys));
    }, [apiKeys]);

    useEffect(() => {
        localStorage.setItem('low_quota_mode', lowQuotaMode ? '1' : '0');
    }, [lowQuotaMode]);

    const getAvatarUrl = (url?: string) => {
        if (!url) return null;
        const base = (localStorage.getItem('api_url') || (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000').replace('/api/v1', '');
        return url.startsWith('http') ? url : `${base}${url}`;
    };

    const handleLogout = () => { logout(); navigate('/signin'); };

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        setProfileMessage(null);
        try {
            await authApi.updateProfile({ full_name: editForm.full_name, email: editForm.email });
            await refreshProfile();
            setIsEditingProfile(false);
            setProfileMessage('Profile updated successfully.');
        } catch (err: any) {
            setProfileMessage(err?.message || 'Failed to update profile.');
        } finally {
            setSavingProfile(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setProfileMessage(null);
        try {
            await authApi.uploadAvatar(file);
            await refreshProfile();
            setProfileMessage('Avatar updated.');
        } catch (err: any) {
            setProfileMessage(err?.message || 'Failed to upload avatar.');
        }
    };

    const handleExportRideData = async () => {
        try {
            const rides = await ridesApi.list();
            const blob = new Blob([JSON.stringify(rides, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `raptor_rides_export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to export rides', e);
        }
    };

    const handleDeleteAccount = async () => {
        if (window.confirm("Are you absolutely sure you want to permanently delete your account and all telemetry data? This cannot be undone.")) {
            try {
                await authApi.deleteAccount();
                localStorage.clear();
                window.location.assign('/signin');
            } catch (e) {
                console.error('Failed to delete account', e);
                alert("Failed to delete account.");
            }
        }
    };

    const handleTestApiConnection = async () => {
        if (!apiUrl.trim()) { setApiMessage('Enter a valid backend URL.'); return; }
        setTestingApi(true);
        setApiMessage(null);
        try {
            const ok = await checkConnection(apiUrl.trim());
            setApiMessage(ok ? '✓ Connection successful.' : '✗ Connection failed. Check URL and backend status.');
        } finally {
            setTestingApi(false);
        }
    };

    const handleApplyApiUrl = () => {
        if (!apiUrl.trim()) { setApiMessage('Enter a valid backend URL.'); return; }
        setBaseUrl(apiUrl.trim());
        localStorage.setItem('api_url', apiUrl.trim());
        setApiMessage('Backend URL saved.');
    };

    const handleResetLocalAiPrefs = () => {
        localStorage.removeItem('ts_api_keys');
        localStorage.removeItem('low_quota_mode');
        setApiKeys({});
        setLowQuotaMode(false);
    };

    if (!user) return <div style={{ padding: '2rem', color: '#fff' }}>Loading settings…</div>;

    const initials = (user.full_name || user.email).slice(0, 2).toUpperCase();

    const tabs: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
        { id: 'profile', label: 'Profile', icon: <User size={15} /> },
        { id: 'llm', label: 'LLM Config', icon: <Cpu size={15} /> },
        { id: 'other', label: 'Other', icon: <Settings2 size={15} /> },
    ];

    return (
        <div className="sp-root">
            {/* ── premium horizontal segmented controls ── */}
            <div className="sp-topbar">
                <h2 className="sp-page-title">Settings</h2>
                <div className="sp-nav-horizontal">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            className={`sp-pill-tab${activeSection === t.id ? ' active' : ''}`}
                            onClick={() => setActiveSection(t.id)}
                        >
                            <span className="sp-pill-icon">{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── main content ── */}
            <div className="sp-main">
                {/* ===== PROFILE ===== */}
                {activeSection === 'profile' && (
                    <div className="sp-card sp-anim">
                        <div className="sp-card-header">
                            <User size={18} />
                            <h2>Profile</h2>
                            <span className="sp-badge">Identity</span>
                        </div>

                        {/* avatar + quick info */}
                        <div className="sp-profile-top">
                            <div className="sp-avatar-wrap">
                                {user.profile_picture_url ? (
                                    <img
                                        src={getAvatarUrl(user.profile_picture_url)!}
                                        alt="avatar"
                                        className="sp-avatar-img"
                                    />
                                ) : (
                                    <div className="sp-avatar-fallback">{initials}</div>
                                )}
                                <button
                                    className="sp-avatar-edit"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Upload photo"
                                >
                                    <Camera size={13} />
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={handleAvatarUpload}
                                />
                            </div>
                            <div className="sp-profile-info">
                                <p className="sp-profile-name">{user.full_name || '—'}</p>
                                <p className="sp-profile-email">{user.email}</p>
                                <div className="sp-pill-row">
                                    <span className="sp-pill">{user.profile_picture_url ? 'Custom avatar' : 'Default avatar'}</span>
                                    <span className="sp-pill">Session active</span>
                                </div>
                            </div>
                        </div>

                        {/* edit form */}
                        {isEditingProfile ? (
                            <div className="sp-form-grid">
                                <label className="sp-label">
                                    Full name
                                    <input
                                        className="sp-input"
                                        value={editForm.full_name}
                                        onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                                    />
                                </label>
                                <label className="sp-label">
                                    Email
                                    <input
                                        className="sp-input"
                                        type="email"
                                        value={editForm.email}
                                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                                    />
                                </label>
                            </div>
                        ) : (
                            <div className="sp-form-grid">
                                <div className="sp-readonly">
                                    <span className="sp-readonly-label">Full name</span>
                                    <span className="sp-readonly-val">{user.full_name || '—'}</span>
                                </div>
                                <div className="sp-readonly">
                                    <span className="sp-readonly-label">Email</span>
                                    <span className="sp-readonly-val">{user.email}</span>
                                </div>
                            </div>
                        )}

                        {profileMessage && <div className="sp-note">{profileMessage}</div>}

                        <div className="sp-actions">
                            {isEditingProfile ? (
                                <>
                                    <button className="sp-btn sp-btn-primary" onClick={handleSaveProfile} disabled={savingProfile}>
                                        <Save size={14} /> {savingProfile ? 'Saving…' : 'Save'}
                                    </button>
                                    <button className="sp-btn sp-btn-ghost" onClick={() => { setIsEditingProfile(false); setEditForm({ full_name: user.full_name || '', email: user.email }); }}>
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <button className="sp-btn sp-btn-primary" onClick={() => setIsEditingProfile(true)}>
                                    <Edit2 size={14} /> Edit Profile
                                </button>
                            )}
                            <button className="sp-btn sp-btn-danger" onClick={handleLogout} style={{ marginLeft: 'auto' }}>
                                <LogOut size={14} /> Sign Out
                            </button>
                        </div>

                        {/* --- NEW DATA PANELS --- */}
                        <div className="sp-surface" style={{ marginTop: '2rem' }}>
                            <div className="sp-surface-title">Data Storage & Telemetry</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', marginTop: '0.5rem' }}>
                                <span className="sp-subtext">Used Analytics Storage</span>
                                <span className="sp-subtext" style={{ color: '#fff', fontWeight: 600 }}>
                                    {profileStats?.total_data_bytes ? `${(profileStats.total_data_bytes / (1024 * 1024)).toFixed(2)} MB` : '0 MB'} / 5 GB
                                </span>
                            </div>
                            <div className="sp-progress-bg">
                                <div className="sp-progress-fill" style={{ width: `${Math.min(((profileStats?.total_data_bytes || 0) / 5_000_000_000) * 100, 100).toFixed(1)}%` }}></div>
                            </div>
                            <div className="sp-toggle-row" style={{ marginTop: '1.25rem' }}>
                                <div>
                                    <p className="sp-toggle-label">Contribute to Global Analytics</p>
                                    <p className="sp-toggle-desc">Allow anonymous aggregation of ride routes to improve Raptor features.</p>
                                </div>
                                <button 
                                    className={`sp-toggle${shareAnalytics ? ' on' : ' off'}`}
                                    onClick={() => setShareAnalytics(!shareAnalytics)}
                                >
                                    {shareAnalytics ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>

                        <div className="sp-surface" style={{ marginTop: '1rem' }}>
                            <div className="sp-surface-title">Data Management</div>
                            <p className="sp-toggle-desc" style={{ marginBottom: '1rem', marginTop: '0.5rem' }}>
                                Export your raw telemetry data as JSON, or permanently wipe your account and all linked rides from the system.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button className="sp-btn sp-btn-ghost" onClick={handleExportRideData}>
                                    <Download size={14} /> Export Ride Data
                                </button>
                                <button className="sp-btn sp-btn-danger" onClick={handleDeleteAccount}>
                                    <Trash2 size={14} /> Delete Account
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== LLM CONFIG ===== */}
                {activeSection === 'llm' && (
                    <div className="sp-card sp-anim">
                        <div className="sp-card-header">
                            <Cpu size={18} />
                            <h2>LLM Configuration</h2>
                            <span className="sp-badge">AI Defaults</span>
                        </div>
                        <p className="sp-subtext">Add API keys for each provider to unlock their models in chat.</p>

                        <div className="sp-llm-search">
                            <Search size={16} className="sp-llm-search-icon" />
                            <input
                                type="text"
                                className="sp-input sp-search-input"
                                placeholder="Search providers..."
                                value={llmSearchQuery}
                                onChange={(e) => setLlmSearchQuery(e.target.value)}
                            />
                        </div>

                        {providerLoading && <div className="sp-note">Loading providers…</div>}
                        {providerError && <div className="sp-note sp-note-err">{providerError}</div>}

                        {!providerLoading && !providerError && (
                            <div className="sp-provider-grid">
                                {providers.filter(p => p.label.toLowerCase().includes(llmSearchQuery.toLowerCase())).map(p => {
                                    const hasKey = Boolean(apiKeys[p.id]);
                                    const isEditing = editingProviderId === p.id;
                                    return (
                                        <div key={p.id} className={`sp-provider-card${hasKey ? ' has-key' : ''}`}>
                                            <div className="sp-provider-card-header">
                                                <div className="sp-provider-icon">
                                                    {getProviderIcon(p.id)}
                                                </div>
                                                <div className="sp-provider-actions">
                                                    {!isEditing && (
                                                        <>
                                                            <button
                                                                className="sp-icon-btn"
                                                                onClick={() => { setEditApiKey(apiKeys[p.id] || ''); setEditingProviderId(p.id); }}
                                                                title="Edit key"
                                                            >
                                                                <Edit2 size={15} />
                                                            </button>
                                                            {hasKey && (
                                                                <button
                                                                    className="sp-icon-btn sp-icon-btn-danger"
                                                                    onClick={() => { const next = { ...apiKeys }; delete next[p.id]; setApiKeys(next); }}
                                                                    title="Remove key"
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="sp-provider-body">
                                                <p className="sp-provider-name">{p.label}</p>
                                                <p className="sp-provider-status">
                                                    <span className="sp-status-dot"></span>
                                                    {hasKey ? 'Key configured' : 'Using Defaults'}
                                                </p>
                                            </div>

                                            {isEditing && (
                                                <div className="sp-provider-edit">
                                                    <input
                                                        className="sp-input"
                                                        type="password"
                                                        placeholder={`Paste ${p.label} API key…`}
                                                        value={editApiKey}
                                                        onChange={e => setEditApiKey(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <div className="sp-edit-actions">
                                                        <button
                                                            className="sp-btn sp-btn-primary"
                                                            onClick={() => {
                                                                if (editApiKey.trim()) {
                                                                    setApiKeys({ ...apiKeys, [p.id]: editApiKey.trim() });
                                                                } else {
                                                                    const next = { ...apiKeys };
                                                                    delete next[p.id];
                                                                    setApiKeys(next);
                                                                }
                                                                setEditingProviderId(null);
                                                            }}
                                                        >
                                                            <Save size={13} /> Save
                                                        </button>
                                                        <button className="sp-btn sp-btn-ghost" onClick={() => setEditingProviderId(null)}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {providers.length === 0 && (
                                    <p className="sp-empty">No providers returned from the server.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ===== OTHER ===== */}
                {activeSection === 'other' && (
                    <div className="sp-card sp-anim">
                        <div className="sp-card-header">
                            <Settings2 size={18} />
                            <h2>Other Settings</h2>
                            <span className="sp-badge">Environment</span>
                        </div>
                        <p className="sp-subtext">Backend connectivity, data preferences, and UI settings.</p>

                        {/* UI Preferences */}
                        <div className="sp-surface">
                            <div className="sp-surface-title">UI Preferences</div>
                            <div className="sp-toggle-row">
                                <div>
                                    <p className="sp-toggle-label">Map Background in Grid View</p>
                                    <p className="sp-toggle-desc">Show the CartoDB dark map tiles behind the route track on dashboard grid cards. Disable to show track only on a plain dark background.</p>
                                </div>
                                <button
                                    className={`sp-toggle${gridMapEnabled ? ' on' : ' off'}`}
                                    onClick={() => {
                                        const next = !gridMapEnabled;
                                        setGridMapEnabled(next);
                                        localStorage.setItem('grid_map_enabled', next ? '1' : '0');
                                    }}
                                >
                                    {gridMapEnabled ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>

                        {/* Low quota toggle */}
                        <div className="sp-surface">
                            <div className="sp-surface-title">Data Quota Mode</div>
                            <div className="sp-toggle-row">
                                <div>
                                    <p className="sp-toggle-label">Low Quota Mode</p>
                                    <p className="sp-toggle-desc">Reduces payload sizes to save bandwidth on metered connections.</p>
                                </div>
                                <button
                                    className={`sp-toggle${lowQuotaMode ? ' on' : ' off'}`}
                                    onClick={() => setLowQuotaMode(v => !v)}
                                >
                                    {lowQuotaMode ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>

                        {/* API URL */}
                        <div className="sp-surface">
                            <div className="sp-surface-title">Backend API URL</div>
                            <div className="sp-url-row">
                                <input
                                    className="sp-input"
                                    type="text"
                                    placeholder="https://api.yourdomain.com"
                                    value={apiUrl}
                                    onChange={e => setApiUrl(e.target.value)}
                                />
                                <button className="sp-btn sp-btn-ghost" onClick={handleTestApiConnection} disabled={testingApi}>
                                    {testingApi ? 'Testing…' : 'Test'}
                                </button>
                                <button className="sp-btn sp-btn-primary" onClick={handleApplyApiUrl}>
                                    Apply
                                </button>
                            </div>
                            {apiMessage && <div className={`sp-note${apiMessage.startsWith('✓') ? ' sp-note-ok' : ''}`}>{apiMessage}</div>}
                        </div>

                        {/* Danger */}
                        <div className="sp-surface sp-surface-danger">
                            <div className="sp-surface-title" style={{ color: '#ff8d8d' }}>Danger Zone</div>
                            <p className="sp-toggle-desc">This will remove all locally stored API keys and reset quota preferences.</p>
                            <div style={{ marginTop: '0.75rem' }}>
                                <button className="sp-btn sp-btn-danger" onClick={handleResetLocalAiPrefs}>
                                    Reset Local AI Preferences
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── all styles ── */}
            <style>{`
                .sp-root {
                    display: flex;
                    flex-direction: column;
                    gap: 2.5rem;
                    min-height: calc(100vh - 72px);
                    padding: 1.5rem 2.5rem;
                    background: var(--bg-primary, transparent);
                    color: var(--text-primary, #fff);
                    max-width: 1200px;
                    margin: 0 auto;
                    width: 100%;
                    box-sizing: border-box;
                }

                /* ── top bar elements ── */
                .sp-topbar {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .sp-page-title {
                    margin: 0;
                    font-size: 1.8rem;
                    font-weight: 800;
                    letter-spacing: -0.5px;
                    color: #fff;
                    display: none; /* Hide if the global header already provides context, or keep it visible */
                }
                .sp-nav-horizontal {
                    display: flex;
                    gap: 0.5rem;
                    background: rgba(20,20,22,0.6);
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 999px;
                    padding: 0.45rem;
                    width: fit-content;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                }
                .sp-pill-tab {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.65rem;
                    padding: 0.6rem 1.4rem;
                    border-radius: 999px;
                    border: 1px solid transparent;
                    background: transparent;
                    color: var(--text-muted, #71717a);
                    cursor: pointer;
                    font-size: 0.95rem;
                    font-weight: 600;
                    transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
                    font-family: inherit;
                    white-space: nowrap;
                }
                .sp-pill-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }
                .sp-pill-tab:hover {
                    background: rgba(255,255,255,0.04);
                    color: #e4e4e7;
                }
                .sp-pill-tab:hover .sp-pill-icon { opacity: 0.9; }
                .sp-pill-tab.active {
                    background: var(--accent-primary, #dc2626);
                    color: #fff;
                    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
                    transform: translateY(-1px);
                    border-color: rgba(255,255,255,0.1);
                }
                .sp-pill-tab.active .sp-pill-icon { opacity: 1; color: #fff; }

                /* ── main card ── */
                .sp-main { flex: 1; min-width: 0; }
                .sp-card {
                    background: var(--bg-card, rgba(20,20,22,0.6));
                    backdrop-filter: blur(32px);
                    -webkit-backdrop-filter: blur(32px);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-top: 1px solid rgba(255,255,255,0.12);
                    border-radius: 20px;
                    padding: 3rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.8rem;
                    box-shadow: 0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
                }
                .sp-anim { animation: sp-slide 220ms cubic-bezier(0.25,1,0.5,1); }
                @keyframes sp-slide {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .sp-card-header {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    color: #e2e8f0;
                }
                .sp-card-header h2 {
                    margin: 0;
                    font-size: 1.15rem;
                    font-weight: 700;
                    letter-spacing: -0.3px;
                }
                .sp-badge {
                    margin-left: auto;
                    font-size: 0.68rem;
                    font-weight: 700;
                    letter-spacing: 0.6px;
                    text-transform: uppercase;
                    color: #ff9999;
                    background: rgba(220,0,0,0.08);
                    border: 1px solid rgba(220,0,0,0.2);
                    border-radius: 999px;
                    padding: 0.18rem 0.65rem;
                }
                .sp-subtext {
                    margin: 0;
                    color: #71717a;
                    font-size: 0.88rem;
                }
                .sp-note {
                    padding: 0.7rem 1rem;
                    border-radius: 10px;
                    font-size: 0.85rem;
                    color: #e2e8f0;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-left: 3px solid #dc2626;
                }
                .sp-note.sp-note-ok  { border-left-color: #22c55e; color: #86efac; }
                .sp-note.sp-note-err { border-left-color: #dc2626; color: #fca5a5; }

                /* ── profile top ── */
                .sp-profile-top {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }
                .sp-avatar-wrap {
                    position: relative;
                    flex-shrink: 0;
                }
                .sp-avatar-img,
                .sp-avatar-fallback {
                    width: 88px;
                    height: 88px;
                    border-radius: 22px;
                    border: 2px solid rgba(255,255,255,0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2rem;
                    font-weight: 700;
                    object-fit: cover;
                }
                .sp-avatar-fallback {
                    background: linear-gradient(135deg, rgba(220,0,0,0.15) 0%, rgba(24,24,27,1) 100%);
                    color: #fff;
                }
                .sp-avatar-edit {
                    position: absolute;
                    right: -6px;
                    bottom: -6px;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(24,24,27,1);
                    color: #fff;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .sp-avatar-edit:hover {
                    background: #dc2626;
                    border-color: #dc2626;
                }
                .sp-profile-name {
                    margin: 0 0 0.2rem;
                    font-size: 1.15rem;
                    font-weight: 700;
                    color: #fff;
                }
                .sp-profile-email {
                    margin: 0 0 0.6rem;
                    font-size: 0.88rem;
                    color: #71717a;
                }
                .sp-pill-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
                .sp-pill {
                    font-size: 0.74rem;
                    padding: 0.18rem 0.65rem;
                    border-radius: 999px;
                    background: #18181b;
                    border: 1px solid #27272a;
                    color: #a1a1aa;
                    -webkit-appearance: none;
                    appearance: none;
                    display: inline-block;
                }

                /* ── Progress bars ── */
                .sp-progress-bg {
                    width: 100%;
                    height: 8px;
                    background: rgba(255,255,255,0.06);
                    border-radius: 999px;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.03);
                    box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
                }
                .sp-progress-fill {
                    height: 100%;
                    background: #e4e4e7;
                    border-radius: 999px;
                    box-shadow: 0 0 8px rgba(255, 255, 255, 0.15);
                    transition: width 1s cubic-bezier(0.2, 0.8, 0.2, 1);
                }

                /* ── form ── */
                .sp-form-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0,1fr));
                    gap: 0.85rem;
                }
                .sp-label {
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                    font-size: 0.8rem;
                    color: var(--text-muted, #71717a);
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                }
                .sp-input {
                    padding: 0.65rem 0.85rem;
                    border-radius: 10px;
                    border: 1px solid var(--border-color, rgba(255,255,255,0.08));
                    background: rgba(0,0,0,0.3);
                    color: var(--text-primary, #fff);
                    font-size: 0.95rem;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    width: 100%;
                    box-sizing: border-box;
                    font-family: inherit;
                }
                .sp-input:focus {
                    border-color: var(--accent-primary, rgb(220,0,0));
                    box-shadow: 0 0 0 3px var(--accent-primary, rgba(220,0,0,0.18));
                }
                .sp-readonly {
                    display: flex;
                    flex-direction: column;
                    gap: 0.3rem;
                    padding: 0.65rem 0.85rem;
                    border-radius: 10px;
                    background: var(--bg-card, rgba(255,255,255,0.02));
                    border: 1px solid var(--border-color, rgba(255,255,255,0.05));
                }
                .sp-readonly-label {
                    font-size: 0.74rem;
                    color: #52525b;
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                }
                .sp-readonly-val {
                    font-size: 0.95rem;
                    color: #e4e4e7;
                    font-weight: 500;
                }

                /* ── actions ── */
                .sp-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.65rem;
                    flex-wrap: wrap;
                }
                .sp-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.45rem;
                    padding: 0.6rem 1.1rem;
                    border-radius: 10px;
                    font-size: 0.88rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: 1px solid transparent;
                    transition: all 0.18s ease;
                    font-family: inherit;
                }
                .sp-btn:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
                .sp-btn-primary {
                    background: linear-gradient(135deg, rgba(220,0,0,0.9) 0%, rgba(170,0,0,1) 100%);
                    color: #fff;
                    border-color: rgba(255,255,255,0.08);
                    box-shadow: 0 3px 10px rgba(220,0,0,0.25);
                }
                .sp-btn-primary:hover {
                    box-shadow: 0 5px 16px rgba(220,0,0,0.38);
                    transform: translateY(-1px);
                }
                .sp-btn-ghost {
                    background: rgba(255,255,255,0.04);
                    color: #d4d4d8;
                    border-color: rgba(255,255,255,0.1);
                }
                .sp-btn-ghost:hover {
                    background: rgba(255,255,255,0.08);
                    border-color: rgba(255,255,255,0.18);
                }
                .sp-btn-danger {
                    background: rgba(220,0,0,0.06);
                    color: #fca5a5;
                    border-color: rgba(220,0,0,0.22);
                }
                .sp-btn-danger:hover {
                    background: rgba(220,0,0,0.16);
                    border-color: rgba(220,0,0,0.4);
                    color: #fecaca;
                }

                /* ── providers grid ── */
                .sp-provider-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 1.25rem;
                }
                .sp-provider-card {
                    display: flex;
                    flex-direction: column;
                    padding: 1.5rem;
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    background: rgba(20, 20, 20, 0.4);
                    transition: all 0.2s ease;
                    position: relative;
                }
                .sp-provider-card:hover {
                    background: rgba(255, 255, 255, 0.03);
                    border-color: rgba(255, 255, 255, 0.1);
                    transform: translateY(-1px);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
                }
                .sp-provider-card.has-key {
                    background: rgba(255, 255, 255, 0.035);
                    border-color: rgba(255, 255, 255, 0.09);
                }
                .sp-provider-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1.25rem;
                }
                .sp-provider-icon {
                    width: 44px;
                    height: 44px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255,255,255,0.85);
                }
                .sp-provider-card:hover .sp-provider-icon,
                .sp-provider-card.has-key .sp-provider-icon {
                    color: #fff;
                }
                .sp-provider-body {
                    display: flex;
                    flex-direction: column;
                    gap: 0.2rem;
                }
                .sp-provider-name {
                    margin: 0;
                    font-size: 1.05rem;
                    font-weight: 600;
                    letter-spacing: -0.01em;
                    color: rgba(255,255,255,0.9);
                }
                .sp-provider-status {
                    margin: 0;
                    font-size: 0.85rem;
                    color: rgba(255,255,255,0.4);
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }
                .sp-provider-card.has-key .sp-provider-status {
                    color: rgba(255,255,255,0.6);
                }
                .sp-status-dot {
                    width: 6px;
                    height: 6px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 50%;
                }
                .sp-provider-card.has-key .sp-status-dot {
                    background: #22c55e;
                    box-shadow: 0 0 8px rgba(34,197,94,0.4);
                }
                .sp-provider-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                }
                .sp-icon-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    border: 1px solid transparent;
                    background: transparent;
                    color: rgba(255,255,255,0.5);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                }
                .sp-icon-btn:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); }
                .sp-icon-btn-danger:hover { background: rgba(239,68,68,0.1); color: #ef4444; }
                .sp-provider-edit {
                    border-top: 1px solid rgba(255,255,255,0.06);
                    padding-top: 1.25rem;
                    margin-top: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .sp-edit-actions { display: flex; gap: 0.5rem; }
                .sp-empty { color: #52525b; font-size: 0.88rem; text-align: center; padding: 2rem 0; width: 100%; grid-column: 1 / -1; }

                /* ── search ── */
                .sp-llm-search {
                    position: relative;
                    width: 100%;
                    max-width: 400px;
                    margin-bottom: 0.5rem;
                }
                .sp-llm-search-icon {
                    position: absolute;
                    left: 1rem;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--text-muted, #71717a);
                    pointer-events: none;
                }
                .sp-search-input {
                    padding-left: 2.8rem;
                    border-radius: 999px;
                }

                /* ── surfaces (other section) ── */
                .sp-surface {
                    padding: 1.5rem;
                    border-radius: 12px;
                    background: var(--bg-secondary, rgba(255,255,255,0.03));
                    border: 1px solid var(--border-color, rgba(255,255,255,0.08));
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    transition: all 0.2s ease;
                }
                .sp-surface:hover {
                    background: rgba(255,255,255,0.05);
                    border-color: rgba(255,255,255,0.12);
                }
                .sp-surface-danger {
                    border-color: var(--accent-primary, rgba(220,0,0,0.3));
                    background: rgba(220,0,0,0.03);
                }
                .sp-surface-danger:hover {
                    background: rgba(220,0,0,0.06);
                    border-color: var(--accent-primary, rgba(220,0,0,0.4));
                }
                .sp-surface-title {
                    font-size: 0.85rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.6px;
                    color: var(--text-primary, #ffffff);
                    margin-bottom: 0.25rem;
                }
                .sp-toggle-row {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    justify-content: space-between;
                }
                .sp-toggle-label {
                    margin: 0 0 0.15rem;
                    font-size: 0.93rem;
                    font-weight: 600;
                    color: #e4e4e7;
                }
                .sp-toggle-desc {
                    margin: 0;
                    font-size: 0.82rem;
                    color: #71717a;
                }
                .sp-toggle {
                    padding: 0.3rem 0.9rem;
                    border-radius: 999px;
                    font-size: 0.74rem;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    cursor: pointer;
                    border: 1px solid;
                    transition: all 0.2s;
                    flex-shrink: 0;
                    font-family: inherit;
                    background-color: transparent;
                    color: inherit;
                }
                .sp-toggle.on  { background: rgba(220,0,0,0.2); color: #fca5a5; border-color: rgba(220,0,0,0.4); }
                .sp-toggle.off { background: rgba(255,255,255,0.05); color: #71717a; border-color: rgba(255,255,255,0.1); }
                .sp-url-row {
                    display: flex;
                    gap: 0.6rem;
                    align-items: stretch;
                }
                .sp-url-row .sp-input { flex: 1; }

                /* ── responsive ── */
                @media (max-width: 768px) {
                    .sp-root { padding: 1rem; }
                    .sp-nav-horizontal { width: 100%; overflow-x: auto; border-radius: 16px; padding: 0.6rem; }
                    .sp-pill-tab { flex: 1; justify-content: center; border-radius: 12px; }
                }
                @media (max-width: 560px) {
                    .sp-form-grid { grid-template-columns: 1fr; }
                    .sp-profile-top { flex-direction: column; align-items: flex-start; gap: 1rem; }
                    .sp-url-row { flex-direction: column; }
                    .sp-card { padding: 1rem; }
                }
            `}</style>
        </div>
    );
};

export default SettingsPage;
