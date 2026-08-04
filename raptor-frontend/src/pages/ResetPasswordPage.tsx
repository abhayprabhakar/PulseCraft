import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { Lock, Mail } from 'lucide-react';

const ResetPasswordPage: React.FC = () => {
    const [identifier, setIdentifier] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        
        setLoading(true);

        try {
            await authApi.resetPassword(identifier, newPassword);
            setSuccess('Password reset successfully!');
            setTimeout(() => navigate('/signin'), 2000);
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || 'Reset failed. Check username/email and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h2>RAPTOR</h2>
                    <span>Reset Password</span>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Backend URL Field */}
                    <div className="form-group">
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Backend URL</span>
                            <span id="status-text-reset" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}></span>
                        </label>
                        <div className="input-wrapper">
                            <div id="status-indicator-reset" style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#666', marginRight: '4px' }} title="Server Status"></div>
                            <input
                                type="text"
                                placeholder="http://localhost:8000"
                                defaultValue={localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || 'http://localhost:8000'}
                                onBlur={(e) => {
                                    const url = e.target.value;
                                    const indicator = document.getElementById('status-indicator-reset');
                                    const statusText = document.getElementById('status-text-reset');
                                    if (indicator) indicator.style.background = '#eab308';
                                    if (statusText) statusText.innerText = 'Checking...';

                                    import('../services/api').then(({ setBaseUrl, checkConnection }) => {
                                        setBaseUrl(url);
                                        checkConnection(url).then(isOk => {
                                            if (indicator) indicator.style.background = isOk ? '#22c55e' : '#ef4444';
                                            if (statusText) statusText.innerText = isOk ? 'Connected' : 'Unreachable';
                                            if (statusText) statusText.style.color = isOk ? '#22c55e' : '#ef4444';
                                        });
                                    });
                                }}
                                style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Username or Email</label>
                        <div className="input-wrapper">
                            <Mail size={18} />
                            <input
                                type="text"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                required
                                placeholder="Enter your username or email"
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>New Password</label>
                        <div className="input-wrapper">
                            <Lock size={18} />
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                placeholder="Enter new password"
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Confirm Password</label>
                        <div className="input-wrapper">
                            <Lock size={18} />
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                placeholder="Confirm new password"
                            />
                        </div>
                    </div>

                    {error && <div className="error-message">{error}</div>}
                    {success && <div className="success-message" style={{ color: '#22c55e', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>{success}</div>}

                    <button type="submit" className="btn-login" disabled={loading}>
                        {loading ? 'Resetting...' : 'Reset Password'}
                    </button>
                    
                    <div className="login-footer" style={{ marginTop: '1rem', textAlign: 'center' }}>
                        <Link to="/signin" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
                            Back to Login
                        </Link>
                    </div>
                </form>
            </div>
            <style>{`
                .login-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg-primary); }
                .login-card { width: 100%; max-width: 400px; padding: 2.5rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
                .login-header { text-align: center; margin-bottom: 2rem; }
                .login-header h2 { font-family: var(--font-heading); color: var(--accent-primary); margin: 0; font-size: 1.8rem; letter-spacing: 1px; }
                .login-header span { color: var(--text-secondary); font-size: 0.9rem; letter-spacing: 2px; text-transform: uppercase; }
                .form-group { margin-bottom: 1.5rem; }
                .form-group label { display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem; }
                .input-wrapper { display: flex; align-items: center; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.8rem; gap: 0.8rem; color: var(--text-muted); transition: border-color 0.2s; }
                .input-wrapper:focus-within { border-color: var(--accent-primary); color: var(--accent-primary); }
                .input-wrapper input { background: transparent; border: none; color: var(--text-primary); width: 100%; outline: none; font-family: var(--font-body); }
                .btn-login { width: 100%; padding: 1rem; background: var(--accent-primary); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s; font-family: var(--font-heading); letter-spacing: 1px; }
                .btn-login:hover { background: var(--accent-secondary); }
                .btn-login:disabled { opacity: 0.7; cursor: not-allowed; }
                .error-message { background: rgba(220, 0, 0, 0.1); color: #ff4d4d; padding: 0.8rem; border-radius: 6px; margin-bottom: 1.5rem; text-align: center; font-size: 0.9rem; }
                .auth-footer { margin-top: 1.5rem; text-align: center; color: var(--text-secondary); font-size: 0.9rem; }
                .auth-footer a { color: var(--accent-primary); text-decoration: none; font-weight: bold; }
                .auth-footer a:hover { text-decoration: underline; }
            `}</style>
        </div>
    );
};

export default ResetPasswordPage;
