import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { stories as storiesApi, Story } from '../api/client';
import StoryIllustration from '../components/StoryIllustration';

export default function StoryScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [story, setStory] = useState<Story | null>(null);
  const [page, setPage] = useState(0); // 0 = cover page
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [toast, setToast] = useState('');
  const textCardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const s = await storiesApi.get(id);
      setStory(s);
      setIsFavorite(s.is_favorite === 1);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Scroll text card to top on page change
  useEffect(() => {
    textCardRef.current?.scrollTo({ top: 0 });
  }, [page]);

  // Track page views
  useEffect(() => {
    if (!story || page === 0) return;
    storiesApi.track('story_page_viewed', { page_number: page }, story.child?.id, id).catch(() => {});
  }, [page, story, id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function toggleFavorite() {
    if (!id) return;
    try {
      const res = await storiesApi.favorite(id);
      setIsFavorite(res.isFavorite);
      showToast(res.isFavorite ? '❤️ Saved to favourites!' : 'Removed from favourites');
    } catch {
      showToast('Could not update');
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading-dots"><div className="ldot" /><div className="ldot" /><div className="ldot" /></div>
      </div>
    );
  }

  if (!story) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <div style={{ fontSize: 40 }}>😕</div>
        <div style={{ color: 'var(--white)', fontWeight: 700 }}>Story not found</div>
        <button onClick={() => navigate('/')} style={{ background: 'var(--yellow)', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>Home</button>
      </div>
    );
  }

  const currentPage = story.pages[page - 1]; // undefined when page=0 (cover)
  const totalPages = story.pages.length;
  const interests = story.child ? [] : [];
  const childInterests: string[] = [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ padding: '48px 20px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '2px solid rgba(255,255,255,0.05)' }}>
        <button className="pop-back" onClick={() => navigate(-1)} style={{ width: 40, height: 40 }}>←</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,213,61,0.12)', border: '1.5px solid rgba(255,213,61,0.2)', borderRadius: 20, padding: '3px 10px', marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--yellow)', letterSpacing: 1, textTransform: 'uppercase' }}>
              {page === 0 ? 'Cover' : `Page ${page} of ${totalPages}`}
            </span>
          </div>
          <div className="ff-fredoka" style={{ fontSize: 16, color: 'var(--white)', lineHeight: 1.2 }}>{story.title}</div>
        </div>
        <button onClick={toggleFavorite} style={{ width: 44, height: 44, borderRadius: 14, background: isFavorite ? 'rgba(255,107,107,0.2)' : 'rgba(255,107,107,0.1)', border: `2px solid ${isFavorite ? 'rgba(255,107,107,0.5)' : 'rgba(255,107,107,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}>
          {isFavorite ? '❤️' : '🤍'}
        </button>
      </div>

      {/* Illustration */}
      <div style={{ margin: '16px 20px 0', borderRadius: 24, height: 210, overflow: 'hidden', border: '2.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        {page === 0 ? (
          // Cover page illustration
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--navy-mid), var(--navy-light))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 64, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))', animation: 'illustFloat 3s ease-in-out infinite' }}>{story.child?.avatar ?? '⭐'}</span>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              {story.child?.name ? `${story.child.name}'s Story` : 'Tap to begin!'}
            </div>
          </div>
        ) : (
          <StoryIllustration
            illustrationPrompt={currentPage?.illustration_prompt ?? ''}
            interests={childInterests}
            pageNumber={page}
          />
        )}
        <style>{`
          @keyframes illustFloat { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-10px) rotate(2deg)} }
        `}</style>
      </div>

      {/* Page progress strip */}
      <div style={{ margin: '12px 20px 0', display: 'flex', gap: 6 }}>
        {story.pages.map((_, i) => (
          <button
            key={i}
            onClick={() => setPage(i + 1)}
            style={{ flex: 1, height: 4, borderRadius: 2, border: 'none', cursor: 'pointer', background: i < page ? 'var(--yellow)' : i === page - 1 ? 'var(--coral)' : 'rgba(255,255,255,0.1)', transition: 'all 0.3s' }}
          />
        ))}
      </div>

      {/* Story text card */}
      <div ref={textCardRef} style={{ margin: '14px 20px 0', padding: '18px', background: 'var(--navy-light)', borderRadius: 20, border: '2px solid rgba(255,255,255,0.05)', flex: 1, overflowY: 'auto' }}>
        {page === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <div className="ff-fredoka" style={{ fontSize: 22, color: 'var(--yellow)', marginBottom: 8 }}>{story.title}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 16 }}>
              A story for {story.child?.name ?? 'you'} ✨
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
              {totalPages} pages · {story.word_count ?? 0} words
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.75, color: 'rgba(255,255,255,0.88)' }}>
            {currentPage?.text}
          </p>
        )}
      </div>

      {/* Controls */}
      <div style={{ padding: '14px 20px 30px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          style={{ width: 50, height: 50, borderRadius: 14, background: 'var(--navy-light)', border: '2px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, cursor: page === 0 ? 'default' : 'pointer', color: 'var(--white)', opacity: page === 0 ? 0.2 : 1, transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          ←
        </button>

        {page < totalPages ? (
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{ flex: 1, padding: 14, borderRadius: 16, background: 'var(--coral)', border: 'none', fontFamily: 'Fredoka One', fontSize: 18, color: 'var(--white)', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: '0 5px 0 var(--coral-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {page === 0 ? 'Begin Story' : 'Next Page'} →
          </button>
        ) : (
          <button
            onClick={() => navigate('/')}
            style={{ flex: 1, padding: 14, borderRadius: 16, background: 'var(--yellow)', border: 'none', fontFamily: 'Fredoka One', fontSize: 18, color: 'var(--navy)', cursor: 'pointer', boxShadow: '0 5px 0 var(--yellow-deep)' }}
          >
            🎉 The End!
          </button>
        )}

        <button
          onClick={toggleFavorite}
          style={{ width: 50, height: 50, borderRadius: 14, background: isFavorite ? 'rgba(255,107,107,0.2)' : 'rgba(255,107,107,0.1)', border: `2px solid ${isFavorite ? 'rgba(255,107,107,0.5)' : 'rgba(255,107,107,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          {isFavorite ? '❤️' : '🤍'}
        </button>
      </div>

      {/* Toast */}
      {toast && <div className="toast success">{toast}</div>}
    </div>
  );
}
