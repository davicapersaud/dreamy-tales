import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { stories as storiesApi, children as childrenApi, Child, StorySummary } from '../api/client';

export default function LibraryScreen() {
  const navigate = useNavigate();
  const [childList, setChildList] = useState<Child[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [storyList, setStoryList] = useState<StorySummary[]>([]);
  const [favOnly, setFavOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const loadChildren = useCallback(async () => {
    const cl = await childrenApi.list();
    setChildList(cl);
    if (cl.length > 0 && !activeChildId) setActiveChildId(cl[0].id);
  }, [activeChildId]);

  const loadStories = useCallback(async () => {
    if (!activeChildId) return;
    setLoading(true);
    try {
      const res = await storiesApi.byChild(activeChildId);
      setStoryList(res.stories);
    } finally {
      setLoading(false);
    }
  }, [activeChildId]);

  useEffect(() => { loadChildren(); }, [loadChildren]);
  useEffect(() => { loadStories(); }, [loadStories]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this story?')) return;
    await storiesApi.delete(id);
    setStoryList((prev) => prev.filter((s) => s.id !== id));
    showToast('Story deleted');
  }

  async function handleFavorite(id: string) {
    const res = await storiesApi.favorite(id);
    setStoryList((prev) => prev.map((s) => s.id === id ? { ...s, is_favorite: res.isFavorite ? 1 : 0 } : s));
  }

  const displayed = favOnly ? storyList.filter((s) => s.is_favorite === 1) : storyList;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ padding: '50px 24px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="pop-back" onClick={() => navigate('/')}>←</button>
        <div className="ff-fredoka" style={{ fontSize: 28, color: 'var(--white)' }}>
          Story <span className="accent">Library</span>
        </div>
        <button
          onClick={() => setFavOnly(!favOnly)}
          style={{ marginLeft: 'auto', background: favOnly ? 'rgba(255,107,107,0.2)' : 'var(--navy-light)', border: favOnly ? '2px solid rgba(255,107,107,0.4)' : '2px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '6px 12px', color: 'var(--white)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {favOnly ? '❤️ Faves' : '🤍 All'}
        </button>
      </div>

      {/* Child tabs */}
      {childList.length > 1 && (
        <div style={{ padding: '0 24px 12px', display: 'flex', gap: 8 }}>
          {childList.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveChildId(c.id)}
              style={{ flex: 1, background: c.id === activeChildId ? 'rgba(255,213,61,0.1)' : 'var(--navy-light)', border: `2px solid ${c.id === activeChildId ? 'var(--yellow)' : 'transparent'}`, borderRadius: 14, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ fontSize: 20 }}>{c.avatar}</span>
              <span className="ff-fredoka" style={{ fontSize: 16, color: c.id === activeChildId ? 'var(--yellow)' : 'var(--white)' }}>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Stories list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        {loading && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div className="loading-dots" style={{ justifyContent: 'center' }}><div className="ldot" /><div className="ldot" /><div className="ldot" /></div>
          </div>
        )}
        {!loading && displayed.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 48 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
            <div className="ff-fredoka" style={{ fontSize: 22, color: 'var(--white)', marginBottom: 8 }}>
              {favOnly ? 'No favourites yet' : 'No stories yet'}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 24 }}>
              {favOnly ? 'Tap ❤️ on a story to save it here' : 'Generate your first story!'}
            </div>
            {!favOnly && (
              <button className="big-btn" onClick={() => navigate('/')} style={{ maxWidth: 220, margin: '0 auto' }}>
                <span>Create Story</span><span style={{ fontSize: 22 }}>✨</span>
              </button>
            )}
          </div>
        )}
        {displayed.map((s) => (
          <div
            key={s.id}
            style={{ background: 'var(--navy-light)', border: '2px solid rgba(255,255,255,0.05)', borderRadius: 20, padding: '16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}
          >
            {/* Book icon */}
            <div
              onClick={() => navigate(`/story/${s.id}`)}
              style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--navy)', border: '2px solid rgba(255,213,61,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, cursor: 'pointer' }}
            >
              📖
            </div>
            <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(`/story/${s.id}`)}>
              <div className="ff-fredoka" style={{ fontSize: 16, color: 'var(--white)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                {s.page_count} pages · {new Date(s.created_at).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={() => handleFavorite(s.id)}
              style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 2px' }}
            >
              {s.is_favorite ? '❤️' : '🤍'}
            </button>
            <button
              onClick={() => handleDelete(s.id)}
              style={{ background: 'rgba(255,107,107,0.1)', border: '1.5px solid rgba(255,107,107,0.2)', borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, cursor: 'pointer' }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        <div className="nav-item" onClick={() => navigate('/')}>
          <div className="nav-icon">🏠</div>
          <div className="nav-label">Home</div>
        </div>
        <div className="nav-item active">
          <div className="nav-icon">📚</div>
          <div className="nav-label">Library</div>
        </div>
        <div className="nav-item" onClick={() => navigate('/settings')}>
          <div className="nav-icon">👤</div>
          <div className="nav-label">Profile</div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
