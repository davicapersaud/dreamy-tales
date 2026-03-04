import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function PaywallScreen() {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '48px 24px 36px', position: 'relative', zIndex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🌙</div>
      <div className="ff-fredoka" style={{ fontSize: 30, color: 'var(--white)', textAlign: 'center', marginBottom: 8, lineHeight: 1.1 }}>
        You've reached the<br /><span className="accent">daily story limit!</span>
      </div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textAlign: 'center', marginBottom: 32 }}>
        Free accounts get 3 stories per day. Come back tomorrow for more magic!
      </div>

      {/* Premium card */}
      <div style={{ background: 'linear-gradient(135deg, rgba(255,213,61,0.15), rgba(78,205,196,0.1))', border: '2px solid rgba(255,213,61,0.3)', borderRadius: 24, padding: 24, width: '100%', marginBottom: 24 }}>
        <div className="ff-fredoka" style={{ fontSize: 22, color: 'var(--yellow)', marginBottom: 4 }}>✨ Go Premium</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, lineHeight: 1.6 }}>
          Unlock unlimited stories, more child profiles, and priority generation.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: 'rgba(255,213,61,0.12)', border: '1.5px solid rgba(255,213,61,0.25)', borderRadius: 14, padding: '12px', textAlign: 'center' }}>
            <div className="ff-fredoka" style={{ fontSize: 22, color: 'var(--yellow)' }}>$6.99</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>/ month</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(78,205,196,0.12)', border: '2px solid rgba(78,205,196,0.35)', borderRadius: 14, padding: '12px', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -10, right: 8, background: 'var(--mint)', borderRadius: 8, padding: '2px 8px', fontSize: 10, fontWeight: 800, color: 'var(--navy)' }}>BEST VALUE</div>
            <div className="ff-fredoka" style={{ fontSize: 22, color: 'var(--mint)' }}>$49.99</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>/ year</div>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontWeight: 600 }}>
          Payment coming soon — this is a local demo 🏠
        </div>
      </div>

      <button onClick={() => navigate('/')} style={{ width: '100%', background: 'transparent', border: '2px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: '14px', color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        Go back home
      </button>
    </div>
  );
}
