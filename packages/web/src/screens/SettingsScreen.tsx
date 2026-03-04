import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { children as childrenApi, Child } from '../api/client';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [childList, setChildList] = useState<Child[]>([]);

  useEffect(() => {
    childrenApi.list().then(setChildList).catch(() => {});
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ padding: '50px 24px 20px' }}>
        <div className="ff-fredoka" style={{ fontSize: 32, color: 'var(--white)', marginBottom: 4 }}>
          Your <span className="accent">Profile</span>
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
          {user?.email}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        {/* Account card */}
        <div style={{ background: 'var(--navy-light)', border: '2px solid rgba(255,213,61,0.15)', borderRadius: 20, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,213,61,0.15)', border: '2px solid rgba(255,213,61,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
              👤
            </div>
            <div>
              <div className="ff-fredoka" style={{ fontSize: 20, color: 'var(--white)' }}>{user?.displayName}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: user?.tier === 'premium' ? 'rgba(255,213,61,0.15)' : 'rgba(78,205,196,0.1)', border: `1.5px solid ${user?.tier === 'premium' ? 'rgba(255,213,61,0.3)' : 'rgba(78,205,196,0.2)'}`, borderRadius: 8, padding: '2px 8px', marginTop: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: user?.tier === 'premium' ? 'var(--yellow)' : 'var(--mint)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {user?.tier === 'premium' ? '⭐ Premium' : '🌿 Free tier'}
                </span>
              </div>
            </div>
          </div>
          {user?.tier === 'free' && (
            <div style={{ background: 'rgba(255,213,61,0.08)', border: '1.5px solid rgba(255,213,61,0.2)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--yellow)', marginBottom: 4 }}>Free Tier Limits</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                • 3 stories per day<br />
                • Up to 2 child profiles<br />
                • 10 saved stories per child
              </div>
            </div>
          )}
        </div>

        {/* Children */}
        <div style={{ marginBottom: 20 }}>
          <div className="row-label">Dreamer Profiles</div>
          {childList.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/profile/${c.id}`)}
              style={{ background: 'var(--navy-light)', border: '2px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 28 }}>{c.avatar}</span>
              <div style={{ flex: 1 }}>
                <div className="ff-fredoka" style={{ fontSize: 18, color: 'var(--white)' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Age {c.age} · {c.interests.slice(0, 3).join(', ')}</div>
              </div>
              <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)' }}>›</span>
            </div>
          ))}
          {childList.length < 2 && (
            <button
              onClick={() => navigate('/profile/new')}
              style={{ width: '100%', background: 'transparent', border: '2px dashed rgba(255,213,61,0.2)', borderRadius: 16, padding: '14px', color: 'rgba(255,213,61,0.6)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              + Add child profile
            </button>
          )}
        </div>

        {/* Links */}
        <div style={{ background: 'var(--navy-light)', border: '2px solid rgba(255,255,255,0.05)', borderRadius: 20, overflow: 'hidden', marginBottom: 24 }}>
          {[
            { label: '📊 View Metrics Dashboard', action: () => window.open('http://localhost:3001/dashboard', '_blank') },
            { label: '📚 Story Library', action: () => navigate('/library') },
          ].map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: i < 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>{item.label}</span>
              <span style={{ opacity: 0.4 }}>›</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <div style={{ padding: '0 24px 36px' }}>
        <button
          onClick={handleLogout}
          style={{ width: '100%', background: 'rgba(255,107,107,0.1)', border: '2px solid rgba(255,107,107,0.25)', borderRadius: 16, padding: '14px', color: 'var(--coral)', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}
        >
          Sign Out
        </button>
      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        <div className="nav-item" onClick={() => navigate('/')}>
          <div className="nav-icon">🏠</div>
          <div className="nav-label">Home</div>
        </div>
        <div className="nav-item" onClick={() => navigate('/library')}>
          <div className="nav-icon">📚</div>
          <div className="nav-label">Library</div>
        </div>
        <div className="nav-item active">
          <div className="nav-icon">👤</div>
          <div className="nav-label">Profile</div>
        </div>
      </div>
    </div>
  );
}
