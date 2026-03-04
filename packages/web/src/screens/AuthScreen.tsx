import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '48px 24px 36px', position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div className="app-badge">
          <div className="badge-dot" />
          <div className="badge-text">Dreamy Tales</div>
        </div>
        <div className="ff-fredoka" style={{ fontSize: 38, color: 'var(--white)', lineHeight: 1.05, marginBottom: 8 }}>
          {mode === 'login' ? 'Welcome\nBack' : 'Create\nAccount'} <span className="accent">✨</span>
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
          {mode === 'login'
            ? 'Sign in to generate tonight\'s story'
            : 'Start your family\'s story adventure'}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {mode === 'register' && (
          <div className="input-group">
            <label className="input-label">Your Name</label>
            <input
              className="pop-input"
              type="text"
              placeholder="e.g. Alex"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
        )}
        <div className="input-group">
          <label className="input-label">Email</label>
          <input
            className="pop-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="input-group">
          <label className="input-label">Password</label>
          <input
            className="pop-input"
            type="password"
            placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : 1}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(255,107,107,0.15)', border: '1.5px solid rgba(255,107,107,0.3)', borderRadius: 12, padding: '10px 14px', color: 'var(--coral)', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button type="submit" className="big-btn" disabled={loading} style={{ marginBottom: 16 }}>
            <div>
              <div>{loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}</div>
              <div style={{ fontSize: 13, fontFamily: 'Nunito', fontWeight: 700, opacity: 0.6, marginTop: 1 }}>
                {mode === 'login' ? 'Ready for tonight\'s story?' : 'Free to start, no credit card'}
              </div>
            </div>
            <span style={{ fontSize: 28 }}>{loading ? '⏳' : mode === 'login' ? '🚀' : '⭐'}</span>
          </button>

          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            style={{ width: '100%', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 700, padding: '8px 0', cursor: 'pointer' }}
          >
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <span style={{ color: 'var(--yellow)' }}>{mode === 'login' ? 'Sign up free' : 'Sign in'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
