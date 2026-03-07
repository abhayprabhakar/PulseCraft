import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Cpu, Edit2, LogOut, Save, Settings2, Trash2, User, Zap } from 'lucide-react';
import { authApi, checkConnection, LlmProviderOption, ridesApi, setBaseUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

type SettingsSection = 'profile' | 'llm' | 'other';

const SettingsPage: React.FC = () => {
    const { user, refreshProfile, logout } = useAuth();
    const navigate = useNavigate();

    const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

    // Profile
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ full_name: '', email: '' });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // LLM / Providers
    const [providerLoading, setProviderLoading] = useState(false);
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
            {/* ── horizontal tab bar ── */}
            <div className="sp-tabs">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        className={`sp-tab${activeSection === t.id ? ' active' : ''}`}
                        onClick={() => setActiveSection(t.id)}
                    >
                        {t.icon}
                        {t.label}
                    </button>
                ))}
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

                        {providerLoading && <div className="sp-note">Loading providers…</div>}
                        {providerError && <div className="sp-note sp-note-err">{providerError}</div>}

                        {!providerLoading && !providerError && (
                            <div className="sp-provider-list">
                                {providers.map(p => {
                                    const hasKey = Boolean(apiKeys[p.id]);
                                    const isEditing = editingProviderId === p.id;
                                    return (
                                        <div key={p.id} className={`sp-provider-row${hasKey ? ' has-key' : ''}`}>
                                            <div className="sp-provider-left">
                                                <div className="sp-provider-icon">
                                                    <Zap size={16} />
                                                </div>
                                                <div>
                                                    <p className="sp-provider-name">{p.label}</p>
                                                    <p className="sp-provider-status">
                                                        {hasKey ? '● Key configured' : '○ Using Raptor defaults'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="sp-provider-right">
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
                        <p className="sp-subtext">Backend connectivity and data preferences.</p>

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
                    gap: 1rem;
                    min-height: calc(100vh - 72px);
                    padding: 1.5rem;
                    background: var(--bg-primary, #0a0a0f);
                    color: #fff;
                    max-width: 960px;
                    margin: 0 auto;
                    width: 100%;
                    box-sizing: border-box;
                }

                /* ── top tabs ── */
                .sp-tabs {
                    display: flex;
                    gap: 4px;
                    background: rgba(0,0,0,0.3);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 12px;
                    padding: 4px;
                    width: fit-content;
                }
                .sp-tab {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.45rem;
                    padding: 0.5rem 1rem;
                    border-radius: 9px;
                    border: none;
                    background: transparent;
                    color: #71717a;
                    cursor: pointer;
                    font-size: 0.88rem;
                    font-weight: 500;
                    transition: all 0.18s ease;
                    font-family: inherit;
                    white-space: nowrap;
                }
                .sp-tab:hover {
                    background: rgba(255,255,255,0.05);
                    color: #d4d4d8;
                }
                .sp-tab.active {
                    background: linear-gradient(135deg, rgba(220,0,0,0.22) 0%, rgba(220,0,0,0.08) 100%);
                    color: #fff;
                    box-shadow: inset 0 0 0 1px rgba(220,0,0,0.3);
                    font-weight: 600;
                }

                /* ── main card ── */
                .sp-main { flex: 1; min-width: 0; }
                .sp-card {
                    background: linear-gradient(180deg, rgba(20,20,28,0.95) 0%, rgba(12,12,18,0.98) 100%);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-top-color: rgba(255,255,255,0.14);
                    border-radius: 18px;
                    padding: 1.75rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                    backdrop-filter: blur(16px);
                    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
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
                    background: linear-gradient(135deg, rgba(220,0,0,0.15) 0%, rgba(30,30,40,1) 100%);
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
                    background: rgba(30,30,40,1);
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
                    background: #1e1e24;
                    border: 1px solid #2e2e38;
                    color: #a1a1aa;
                    -webkit-appearance: none;
                    appearance: none;
                    display: inline-block;
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
                    color: #71717a;
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                }
                .sp-input {
                    padding: 0.65rem 0.85rem;
                    border-radius: 10px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(0,0,0,0.3);
                    color: #fff;
                    font-size: 0.95rem;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    width: 100%;
                    box-sizing: border-box;
                    font-family: inherit;
                }
                .sp-input:focus {
                    border-color: rgb(220,0,0);
                    box-shadow: 0 0 0 3px rgba(220,0,0,0.18);
                }
                .sp-readonly {
                    display: flex;
                    flex-direction: column;
                    gap: 0.3rem;
                    padding: 0.65rem 0.85rem;
                    border-radius: 10px;
                    background: rgba(255,255,255,0.02);
                    border: 1px solid rgba(255,255,255,0.05);
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

                /* ── providers ── */
                .sp-provider-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.55rem;
                }
                .sp-provider-row {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.85rem 1rem;
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.06);
                    background: rgba(255,255,255,0.02);
                    flex-wrap: wrap;
                    transition: border-color 0.2s;
                }
                .sp-provider-row.has-key {
                    border-color: rgba(34,197,94,0.2);
                    background: rgba(34,197,94,0.03);
                }
                .sp-provider-left {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    flex: 1;
                }
                .sp-provider-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.06);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #a1a1aa;
                    flex-shrink: 0;
                }
                .sp-provider-name {
                    margin: 0 0 0.15rem;
                    font-size: 0.93rem;
                    font-weight: 600;
                    color: #e4e4e7;
                }
                .sp-provider-status {
                    margin: 0;
                    font-size: 0.78rem;
                    color: #71717a;
                }
                .sp-provider-row.has-key .sp-provider-status { color: #4ade80; }
                .sp-provider-right {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }
                .sp-icon-btn {
                    width: 34px;
                    height: 34px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(255,255,255,0.04);
                    color: #a1a1aa;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.18s;
                }
                .sp-icon-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
                .sp-icon-btn-danger:hover { background: rgba(220,0,0,0.15); color: #fca5a5; border-color: rgba(220,0,0,0.3); }
                .sp-provider-edit {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 0.55rem;
                    margin-top: 0.4rem;
                }
                .sp-edit-actions { display: flex; gap: 0.5rem; }
                .sp-empty { color: #52525b; font-size: 0.88rem; text-align: center; padding: 1.5rem 0; }

                /* ── surfaces (other section) ── */
                .sp-surface {
                    padding: 1.1rem 1.25rem;
                    border-radius: 13px;
                    background: rgba(255,255,255,0.02);
                    border: 1px solid rgba(255,255,255,0.06);
                    display: flex;
                    flex-direction: column;
                    gap: 0.7rem;
                }
                .sp-surface-danger {
                    border-color: rgba(220,0,0,0.18);
                    background: rgba(220,0,0,0.02);
                }
                .sp-surface-title {
                    font-size: 0.82rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #a1a1aa;
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
                @media (max-width: 860px) {
                    .sp-root { padding: 0.75rem; }
                    .sp-tabs { width: 100%; overflow-x: auto; }
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
