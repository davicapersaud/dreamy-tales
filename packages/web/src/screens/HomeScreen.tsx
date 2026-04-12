import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { children as childrenApi, stories as storiesApi, Child, QuotaInfo } from '../api/client';
import { useAuth } from '../hooks/useAuth';

const THEME_OPTIONS = [
  { emoji: '🐉', label: 'Dragons' },
  { emoji: '🧚', label: 'Fairies' },
  { emoji: '🚀', label: 'Space' },
  { emoji: '🏰', label: 'Castles' },
  { emoji: '🌊', label: 'Ocean' },
  { emoji: '🤖', label: 'Robots' },
  { emoji: '🦕', label: 'Dinos' },
  { emoji: '✨', label: 'Magic' },
];

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [childList, setChildList] = useState<Child[]>([]);
  const [activeChildIdx, setActiveChildIdx] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [cl, q] = await Promise.all([childrenApi.list(), storiesApi.quota()]);
      setChildList(cl);
      setQuota(q);
    } finally {
      setLoadingChildren(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const activeChild = childList[activeChildIdx] ?? null;
  const atQuotaLimit = quota && !quota.isPremium && quota.remaining === 0;

  function handleGenerate() {
    if (!activeChild) return;
    if (atQuotaLimit) { navigate('/paywall'); return; }
    navigate('/generate', { state: { child: activeChild, theme: selectedTheme } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 1 }}>
      {/* Hero */}
      <div style={{ padding: '50px 24px 0', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 40, right: 20, fontSize: 42, animation: 'starBounce 3s ease-in-out infinite', filter: 'drop-shadow(0 0 12px rgba(255,213,61,0.5))' }}>
          ✨
        </div>
        <div className="app-badge">
          <div className="badge-dot" />
          <div className="badge-text">Dreamy Tales</div>
        </div>
        <div className="ff-fredoka" style={{ fontSize: 40, color: 'var(--white)', lineHeight: 1.05, marginBottom: 6 }}>
          Tonight's<br /><span className="accent">Magic</span> Awaits
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, fontWeight: 600 }}>
          Hey {user?.displayName}! Pick your dreamer & blast off 🚀
        </div>
        {quota && !quota.isPremium && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(78,205,196,0.1)', border: '1.5px solid rgba(78,205,196,0.25)', borderRadius: 12, padding: '4px 10px', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mint)' }}>
              {quota.remaining}/{quota.limit} stories left today
            </span>
          </div>
        )}
        <style>{`
          @keyframes starBounce { 0%,100%{transform:translateY(0) rotate(-5deg)} 50%{transform:translateY(-10px) rotate(5deg)} }
        `}</style>
      </div>

      {/* Profile picker */}
      <div style={{ padding: '20px 24px 0' }}>
        <div className="row-label">Who's the hero tonight?</div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
          {loadingChildren && (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, paddingTop: 8 }}>Loading…</div>
          )}
          {childList.map((child, idx) => (
            <button
              key={child.id}
              onClick={() => setActiveChildIdx(idx)}
              style={{
                flexShrink: 0, minWidth: 110,
                background: idx === activeChildIdx ? 'rgba(255,213,61,0.08)' : 'var(--navy-light)',
                border: `2.5px solid ${idx === activeChildIdx ? 'var(--yellow)' : 'transparent'}`,
                borderRadius: 20, padding: '14px',
                cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                transform: idx === activeChildIdx ? 'scale(1.04)' : 'scale(1)',
              }}
            >
              <span style={{ fontSize: 32, display: 'block', textAlign: 'center', marginBottom: 8 }}>{child.avatar}</span>
              <div className="ff-fredoka" style={{ fontSize: 18, color: 'var(--white)', textAlign: 'center', marginBottom: 2 }}>{child.name}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 8 }}>Age {child.age}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                {child.interests.slice(0, 2).map((tag) => (
                  <span key={tag} style={{ fontSize: 9, fontWeight: 700, color: 'var(--mint)', background: 'rgba(78,205,196,0.12)', padding: '2px 6px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}

          {/* Add child button */}
          {childList.length < 2 && (
            <button
              onClick={() => navigate('/profile/new')}
              style={{ flexShrink: 0, minWidth: 80, background: 'transparent', border: '2.5px dashed rgba(255,255,255,0.12)', borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 120, cursor: 'pointer', transition: 'all 0.25s' }}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'rgba(255,255,255,0.3)' }}>+</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>Add</div>
            </button>
          )}

          {childList.length === 0 && !loadingChildren && (
            <button
              onClick={() => navigate('/profile/new')}
              style={{ flexShrink: 0, minWidth: 140, background: 'rgba(255,213,61,0.08)', border: '2.5px dashed rgba(255,213,61,0.3)', borderRadius: 20, padding: 16, cursor: 'pointer' }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>👶</div>
              <div className="ff-fredoka" style={{ fontSize: 16, color: 'var(--yellow)' }}>Add your first child</div>
            </button>
          )}
        </div>
      </div>

      {/* Theme picker */}
      <div style={{ padding: '20px 24px 0' }}>
        <div className="row-label">Pick a world!</div>
        <div
          style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', cursor: 'grab', userSelect: 'none' }}
          onMouseDown={(e) => {
            const el = e.currentTarget;
            el.dataset.dragging = 'true';
            el.dataset.startX = String(e.pageX - el.offsetLeft);
            el.dataset.scrollLeft = String(el.scrollLeft);
            el.style.cursor = 'grabbing';
          }}
          onMouseMove={(e) => {
            const el = e.currentTarget;
            if (el.dataset.dragging !== 'true') return;
            const x = e.pageX - el.offsetLeft;
            const walk = x - Number(el.dataset.startX);
            el.scrollLeft = Number(el.dataset.scrollLeft) - walk;
          }}
          onMouseUp={(e) => { e.currentTarget.dataset.dragging = 'false'; e.currentTarget.style.cursor = 'grab'; }}
          onMouseLeave={(e) => { e.currentTarget.dataset.dragging = 'false'; e.currentTarget.style.cursor = 'grab'; }}
        >
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.label}
              onClick={() => setSelectedTheme(selectedTheme === t.label ? null : t.label)}
              style={{
                flexShrink: 0, padding: '12px 16px', borderRadius: 16,
                background: selectedTheme === t.label ? 'rgba(255,107,107,0.1)' : 'var(--navy-light)',
                border: `2px solid ${selectedTheme === t.label ? 'var(--coral)' : 'transparent'}`,
                cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                transform: selectedTheme === t.label ? 'scale(1.06)' : 'scale(1)',
                textAlign: 'center', minWidth: 80,
              }}
            >
              <span style={{ fontSize: 26, display: 'block', marginBottom: 5 }}>{t.emoji}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: selectedTheme === t.label ? 'var(--coral)' : 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '24px 24px 0', marginTop: 'auto' }}>
        {atQuotaLimit ? (
          <div>
            <div style={{ background: 'rgba(255,107,107,0.1)', border: '1.5px solid rgba(255,107,107,0.3)', borderRadius: 16, padding: '12px 16px', marginBottom: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>🌙</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)' }}>Daily story limit reached!</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Come back tomorrow for more free stories</div>
            </div>
          </div>
        ) : (
          <button
            className="big-btn"
            onClick={handleGenerate}
            disabled={!activeChild}
          >
            <div>
              <div>Create My Story!</div>
              <div style={{ fontSize: 13, fontFamily: 'Nunito', fontWeight: 700, opacity: 0.6, marginTop: 1 }}>
                for {activeChild?.name ?? '…'}{selectedTheme ? ` • ${selectedTheme}` : ''}
              </div>
            </div>
            <span style={{ fontSize: 28 }}>🎉</span>
          </button>
        )}
      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        <div className="nav-item active">
          <div className="nav-icon">🏠</div>
          <div className="nav-label">Home</div>
        </div>
        <div className="nav-item" onClick={() => navigate('/library')}>
          <div className="nav-icon">📚</div>
          <div className="nav-label">Library</div>
        </div>
        <div className="nav-item" onClick={() => navigate('/settings')}>
          <div className="nav-icon">👤</div>
          <div className="nav-label">Profile</div>
        </div>
      </div>
    </div>
  );
}
