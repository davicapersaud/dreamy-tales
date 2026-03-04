import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { children as childrenApi, Child, CreateChildInput } from '../api/client';

const AVATAR_OPTIONS = ['🦄','🐉','🚀','🌙','⭐','🦊','🐬','🧚','🦁','🐼','🌈','🎠'];
const INTEREST_OPTIONS = [
  'dragons','magic','space','robots','fairies','ocean','castles',
  'animals','music','cooking','sports','dinosaurs','superheroes','art',
];

export default function ProfileScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';

  const [name, setName] = useState('');
  const [age, setAge] = useState(5);
  const [avatar, setAvatar] = useState('⭐');
  const [interests, setInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Parental gate
  const [gateOpen, setGateOpen] = useState(isNew);
  const [gateAnswer, setGateAnswer] = useState('');
  const [gateQuestion, setGateQuestion] = useState({ a: 0, b: 0 });

  useEffect(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    setGateQuestion({ a, b });
  }, []);

  useEffect(() => {
    if (isNew || !id) { setLoading(false); return; }
    childrenApi.list().then((cl) => {
      const c = cl.find((x) => x.id === id);
      if (c) { setName(c.name); setAge(c.age); setAvatar(c.avatar); setInterests(c.interests); }
    }).finally(() => setLoading(false));
  }, [id, isNew]);

  function checkGate(e: React.FormEvent) {
    e.preventDefault();
    if (parseInt(gateAnswer) === gateQuestion.a + gateQuestion.b) {
      setGateOpen(true);
    } else {
      setError('Incorrect answer — try again!');
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (interests.length === 0) { setError('Pick at least one interest'); return; }
    setSaving(true);
    setError('');
    try {
      const data: CreateChildInput = { name: name.trim(), age, avatar, interests };
      if (isNew) {
        await childrenApi.create(data);
      } else {
        await childrenApi.update(id!, data);
      }
      navigate('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || isNew) return;
    if (!confirm('Delete this child profile and all their stories? This cannot be undone.')) return;
    await childrenApi.delete(id);
    navigate('/');
  }

  // Parental gate screen (for edits only)
  if (!gateOpen) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '48px 24px 36px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <button className="pop-back" onClick={() => navigate('/')}>←</button>
          <div className="ff-fredoka" style={{ fontSize: 24, color: 'var(--white)' }}>Parent Check 🔐</div>
        </div>
        <div style={{ background: 'var(--navy-light)', border: '2px solid rgba(255,213,61,0.2)', borderRadius: 20, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>🧮</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 20 }}>
            Solve this to confirm you're the parent:
          </div>
          <div className="ff-fredoka" style={{ fontSize: 36, color: 'var(--yellow)', textAlign: 'center', marginBottom: 24 }}>
            {gateQuestion.a} + {gateQuestion.b} = ?
          </div>
          <form onSubmit={checkGate}>
            <input
              className="pop-input"
              type="number"
              placeholder="Your answer"
              value={gateAnswer}
              onChange={(e) => setGateAnswer(e.target.value)}
              style={{ textAlign: 'center', fontSize: 24, marginBottom: 12 }}
            />
            {error && <div style={{ color: 'var(--coral)', fontSize: 13, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>{error}</div>}
            <button type="submit" className="big-btn" style={{ marginTop: 4 }}>
              <span>Confirm</span><span style={{ fontSize: 24 }}>✅</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading-dots"><div className="ldot" /><div className="ldot" /><div className="ldot" /></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ padding: '50px 24px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="pop-back" onClick={() => navigate('/')}>←</button>
        <div className="ff-fredoka" style={{ fontSize: 26, color: 'var(--white)' }}>
          {isNew ? 'New ' : 'Edit '}<span className="accent">Dreamer</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        {/* Avatar picker */}
        <div className="input-group">
          <label className="input-label">Pick an Avatar</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {AVATAR_OPTIONS.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                style={{ width: 52, height: 52, borderRadius: 14, background: avatar === a ? 'rgba(255,213,61,0.15)' : 'var(--navy-light)', border: `2.5px solid ${avatar === a ? 'var(--yellow)' : 'transparent'}`, fontSize: 26, cursor: 'pointer', transition: 'all 0.2s' }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="input-group">
          <label className="input-label">Child's Name</label>
          <input
            className="pop-input"
            type="text"
            placeholder="e.g. Mia"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
          />
        </div>

        {/* Age */}
        <div className="input-group">
          <label className="input-label">Age: {age}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[3,4,5,6,7,8,9,10].map((a) => (
              <button
                key={a}
                onClick={() => setAge(a)}
                style={{ flex: 1, padding: '10px 4px', background: age === a ? 'rgba(78,205,196,0.15)' : 'var(--navy-light)', border: `2px solid ${age === a ? 'var(--mint)' : 'transparent'}`, borderRadius: 12, color: age === a ? 'var(--mint)' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Interests */}
        <div className="input-group">
          <label className="input-label">Interests (pick 1–5)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {INTEREST_OPTIONS.map((interest) => {
              const active = interests.includes(interest);
              return (
                <button
                  key={interest}
                  onClick={() => {
                    if (active) {
                      setInterests((prev) => prev.filter((i) => i !== interest));
                    } else if (interests.length < 5) {
                      setInterests((prev) => [...prev, interest]);
                    }
                  }}
                  style={{ padding: '8px 14px', borderRadius: 12, background: active ? 'rgba(168,164,255,0.15)' : 'var(--navy-light)', border: `2px solid ${active ? 'var(--lavender)' : 'transparent'}`, color: active ? 'var(--lavender)' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(255,107,107,0.15)', border: '1.5px solid rgba(255,107,107,0.3)', borderRadius: 12, padding: '10px 14px', color: 'var(--coral)', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
            {error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '16px 24px 36px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="big-btn" onClick={handleSave} disabled={saving}>
          <span>{saving ? 'Saving…' : isNew ? 'Create Dreamer!' : 'Save Changes'}</span>
          <span style={{ fontSize: 24 }}>⭐</span>
        </button>
        {!isNew && (
          <button onClick={handleDelete} style={{ background: 'transparent', border: '2px solid rgba(255,107,107,0.3)', borderRadius: 16, padding: '12px', color: 'var(--coral)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            🗑️ Delete this profile
          </button>
        )}
      </div>
    </div>
  );
}
