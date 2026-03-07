import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { Lock, User, Mail } from 'lucide-react';

const SignupPage: React.FC = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        full_name: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await authApi.register(formData);
            alert("Registration successful! Please log in.");
            navigate('/signin');
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || 'Registration failed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h2>RAPTOR</h2>
                    <span>Join the Pack</span>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Backend URL Field */}
                    <div className="form-group">
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Backend URL</span>
                            <span id="status-text-signup" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}></span>
                        </label>
                        <div className="input-wrapper">
                            <div id="status-indicator-signup" style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#666', marginRight: '4px' }} title="Server Status"></div>
                            <input
                                type="text"
                                placeholder="http://localhost:8000"
                                defaultValue={localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || 'http://localhost:8000'}
                                onBlur={(e) => {
                                    const url = e.target.value;
                                    const indicator = document.getElementById('status-indicator-signup');
                                    const statusText = document.getElementById('status-text-signup');
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
                        <label>Full Name</label>
                        <div className="input-wrapper">
                            <User size={18} />
                            <input
                                type="text"
                                name="full_name"
                                value={formData.full_name}
                                onChange={handleChange}
                                required
                                placeholder="Abhay Prabhakar"
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Email</label>
                        <div className="input-wrapper">
                            <Mail size={18} />
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                placeholder="rider@raptor.dev"
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <div className="input-wrapper">
                            <Lock size={18} />
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                placeholder="••••••••"
                                minLength={6}
                            />
                        </div>
                    </div>
                    {error && <div className="error-message">{error}</div>}
                    <button type="submit" disabled={loading} className="btn-login">
                        {loading ? 'Creating Account...' : 'Sign Up'}
                    </button>
                </form>
                <div className="auth-footer">
                    Already have an account? <Link to="/signin">Log In</Link>
                </div>
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

export default SignupPage;
