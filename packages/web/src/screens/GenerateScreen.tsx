import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { stories as storiesApi, Child } from '../api/client';
import { useSSE } from '../hooks/useSSE';

const VIBE_OPTIONS = [
  { emoji: '🌙', label: 'Cozy' },
  { emoji: '⚔️', label: 'Brave' },
  { emoji: '✨', label: 'Magic' },
  { emoji: '😂', label: 'Funny' },
  { emoji: '🤗', label: 'Warm' },
  { emoji: '🌊', label: 'Calm' },
];

type Phase = 'form' | 'loading' | 'done' | 'error';

const LOAD_STEPS = [
  'Imagining the characters…',
  'Writing the adventure…',
  'Adding the magic dust…',
  'Polishing the pages…',
  'Almost ready! ✨',
];

export default function GenerateScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const child = location.state?.child as Child | undefined;
  const presetTheme = location.state?.theme as string | undefined;

  const [prompt, setPrompt] = useState(presetTheme ? `${presetTheme} adventure` : '');
  const [vibe, setVibe] = useState('Cozy');
  const [phase, setPhase] = useState<Phase>('form');
  const [storyId, setStoryId] = useState<string | null>(null);
  const [loadStep, setLoadStep] = useState(0);
  const [error, setError] = useState('');

  // Advance load step text while waiting
  useEffect(() => {
    if (phase !== 'loading') return;
    const t = setInterval(() => setLoadStep((s) => Math.min(s + 1, LOAD_STEPS.length - 1)), 2500);
    return () => clearInterval(t);
  }, [phase]);

  useSSE(storyId, (event) => {
    if (event.type === 'story_complete') {
      setPhase('done');
      setTimeout(() => navigate(`/story/${event.storyId}`), 600);
    } else if (event.type === 'error') {
      setPhase('error');
      setError(event.message);
    }
  });

  async function handleGenerate() {
    if (!child) return;
    setPhase('loading');
    setLoadStep(0);
    try {
      const themePrompt = [prompt.trim(), vibe !== 'Cozy' ? vibe.toLowerCase() + ' vibe' : ''].filter(Boolean).join(', ');
      const res = await storiesApi.generate(child.id, themePrompt || undefined);
      setStoryId(res.storyId);
    } catch (err: unknown) {
      const data = (err as { data?: { showPaywall?: boolean; error?: string } }).data;
      if (data?.showPaywall) {
        navigate('/paywall');
        return;
      }
      setPhase('error');
      setError(data?.error ?? 'Something went wrong. Please try again!');
    }
  }

  if (!child) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24 }}>
        <div style={{ textAlign: 'center', color: 'var(--white)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>😅</div>
          <div className="ff-fredoka" style={{ fontSize: 22 }}>No child selected</div>
          <button onClick={() => navigate('/')} style={{ marginTop: 16, background: 'var(--yellow)', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Loading screen
  if (phase === 'loading' || phase === 'done') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', padding: '0 32px' }}>
          {/* Spinner */}
          <div style={{ width: 120, height: 120, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.05)', borderTop: '4px solid var(--yellow)', borderRight: '4px solid var(--coral)', animation: 'spin 1.2s linear infinite', margin: '0 auto 8px', boxShadow: '0 0 30px rgba(255,213,61,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div style={{ width: 90, height: 90, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.04)', borderBottom: '3px solid var(--mint)', borderLeft: '3px solid var(--lavender)', animation: 'spin 0.8s linear infinite reverse', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 30 }}>{child.avatar}</span>
            </div>
          </div>
          <div className="ff-fredoka" style={{ fontSize: 30, color: 'var(--white)', margin: '24px 0 8px', lineHeight: 1.1 }}>
            Building<br /><span className="accent">{child.name}'s World!</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 32 }}>
            Your illustrated story is being created…
          </div>
          <div className="loading-dots" style={{ marginBottom: 16 }}>
            <div className="ldot" /><div className="ldot" /><div className="ldot" /><div className="ldot" />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>{LOAD_STEPS[loadStep]}</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Error screen
  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32, position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>😔</div>
        <div className="ff-fredoka" style={{ fontSize: 26, color: 'var(--white)', marginBottom: 12, textAlign: 'center' }}>Oops!</div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 32, lineHeight: 1.6 }}>{error}</div>
        <button className="big-btn" onClick={() => { setPhase('form'); setError(''); setStoryId(null); }} style={{ maxWidth: 280 }}>
          <span>Try Again</span><span style={{ fontSize: 24 }}>🔄</span>
        </button>
        <button onClick={() => navigate('/')} style={{ marginTop: 12, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Go home
        </button>
      </div>
    );
  }

  // Form screen
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ padding: '50px 24px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="pop-back" onClick={() => navigate('/')}>←</button>
        <div className="ff-fredoka" style={{ fontSize: 28, color: 'var(--white)' }}>
          Make <span className="accent">Magic!</span>
        </div>
      </div>

      {/* Selected child */}
      <div style={{ margin: '0 24px 20px', background: 'var(--navy-light)', border: '2px solid rgba(255,213,61,0.2)', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 30 }}>{child.avatar}</span>
        <div style={{ flex: 1 }}>
          <div className="ff-fredoka" style={{ fontSize: 18, color: 'var(--white)' }}>{child.name}'s Story</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mint)', marginTop: 2 }}>
            loves {child.interests.slice(0, 3).join(' & ')} ✨
          </div>
        </div>
        <button onClick={() => navigate('/')} style={{ fontSize: 12, fontWeight: 800, color: 'var(--yellow)', opacity: 0.8, background: 'transparent', border: 'none', cursor: 'pointer' }}>
          change
        </button>
      </div>

      {/* Form */}
      <div style={{ padding: '0 24px', flex: 1, overflowY: 'auto' }}>
        <div className="input-group">
          <label className="input-label">What happens?</label>
          <textarea
            className="pop-input"
            rows={3}
            placeholder={`A ${child.interests[0] ?? 'magical'} adventure begins when…`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={200}
          />
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4, textAlign: 'right' }}>
            {prompt.length}/200 — or leave blank for a surprise!
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Story Vibe</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {VIBE_OPTIONS.map((v) => (
              <button
                key={v.label}
                onClick={() => setVibe(v.label)}
                style={{
                  background: vibe === v.label ? 'rgba(255,107,107,0.1)' : 'var(--navy-light)',
                  border: `2px solid ${vibe === v.label ? 'var(--coral)' : 'transparent'}`,
                  borderRadius: 14, padding: '12px 8px', textAlign: 'center',
                  cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                  transform: vibe === v.label ? 'scale(1.04)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: 22, display: 'block', marginBottom: 4 }}>{v.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: vibe === v.label ? 'var(--coral)' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {v.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '16px 24px 36px' }}>
        <button className="big-btn" onClick={handleGenerate} style={{ fontSize: 20, padding: '16px 20px' }}>
          <div>
            <div>Let's Go!</div>
            <div style={{ fontSize: 13, fontFamily: 'Nunito', fontWeight: 700, opacity: 0.6, marginTop: 1 }}>
              Generate illustrated story
            </div>
          </div>
          <span style={{ fontSize: 26 }}>🚀</span>
        </button>
      </div>
    </div>
  );
}
