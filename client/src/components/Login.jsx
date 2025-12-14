import React, { useState } from 'react';
import { login } from '../api/apiClient';

export default function Login({ onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await login(email, password);
            onLoginSuccess();
        } catch (err) {
            setError('Login failed. Check credentials.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100vh', gap: '1rem'
        }}>
            <h2>Invoice Studio Login</h2>
            <form onSubmit={handleSubmit} style={{
                display: 'flex', flexDirection: 'column', gap: '1rem', width: '300px',
                padding: '2rem', border: '1px solid #ccc', borderRadius: '8px', background: '#fff'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label>Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="input"
                        required
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label>Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="input"
                        required
                    />
                </div>
                {error && <div style={{ color: 'red' }}>{error}</div>}
                <button type="submit" className="btn primary" disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                </button>
            </form>
        </div>
    );
}
