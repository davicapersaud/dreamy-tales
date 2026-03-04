import React, { useMemo } from 'react';

// Maps interests/prompt keywords → emoji + gradient combos
const SCENE_MAP: { keywords: string[]; emoji: string[]; bg: [string, string] }[] = [
  { keywords: ['dragon', 'fire', 'castle', 'knight'], emoji: ['🐉', '🏰', '⚔️'], bg: ['#1a0d3e', '#3d1b70'] },
  { keywords: ['space', 'rocket', 'star', 'planet', 'moon', 'galaxy', 'alien'], emoji: ['🚀', '⭐', '🌙', '🪐'], bg: ['#0d1b3e', '#0d2e4e'] },
  { keywords: ['fairy', 'magic', 'sparkle', 'wand', 'enchant'], emoji: ['🧚', '✨', '🌸', '🪄'], bg: ['#2d0d4e', '#4e0d3e'] },
  { keywords: ['ocean', 'sea', 'fish', 'mermaid', 'dolphin', 'whale'], emoji: ['🐬', '🌊', '🐠', '🦀'], bg: ['#0d2e4e', '#0d3e3e'] },
  { keywords: ['robot', 'machine', 'gear', 'tech', 'computer'], emoji: ['🤖', '⚙️', '💡', '🔧'], bg: ['#0d1b3e', '#1b2d0d'] },
  { keywords: ['animal', 'forest', 'jungle', 'bunny', 'fox', 'bear', 'lion', 'tiger'], emoji: ['🦊', '🐻', '🌿', '🍄'], bg: ['#0d2e1b', '#1b3e0d'] },
  { keywords: ['superhero', 'hero', 'cape', 'fly', 'power'], emoji: ['🦸', '⚡', '🌟', '💪'], bg: ['#1b0d3e', '#3e1b0d'] },
  { keywords: ['music', 'song', 'dance', 'sing', 'melody'], emoji: ['🎵', '🎶', '🎸', '🎹'], bg: ['#2e0d1b', '#0d1b3e'] },
  { keywords: ['cook', 'food', 'cake', 'bake', 'kitchen'], emoji: ['🍰', '🧁', '🍕', '⭐'], bg: ['#3e2d0d', '#0d1b3e'] },
  { keywords: ['dinosaur', 'dino', 'prehistoric', 'ancient'], emoji: ['🦕', '🦖', '🌋', '🌿'], bg: ['#1b3e0d', '#3e2d0d'] },
];

const DEFAULT_SCENE = { emoji: ['⭐', '🌙', '✨', '🌟'], bg: ['#0d1b3e', '#1e2f5c'] as [string, string] };

function matchScene(text: string, interests: string[]) {
  const lower = (text + ' ' + interests.join(' ')).toLowerCase();
  for (const scene of SCENE_MAP) {
    if (scene.keywords.some((k) => lower.includes(k))) return scene;
  }
  return DEFAULT_SCENE;
}

interface Props {
  illustrationPrompt: string;
  interests?: string[];
  pageNumber: number;
}

export default function StoryIllustration({ illustrationPrompt, interests = [], pageNumber }: Props) {
  const scene = useMemo(() => matchScene(illustrationPrompt, interests), [illustrationPrompt, interests]);

  // Pick 2-3 emoji deterministically based on page number
  const displayEmoji = scene.emoji.slice(0, pageNumber % 2 === 0 ? 2 : 3);
  const mainEmoji = displayEmoji[0];
  const accentEmoji = displayEmoji.slice(1);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: `linear-gradient(135deg, ${scene.bg[0]}, ${scene.bg[1]}, #0d1b3e)`,
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Glow orbs */}
      <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,213,61,0.1)', filter: 'blur(40px)', top: -40, left: -40 }} />
      <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', background: 'rgba(78,205,196,0.08)', filter: 'blur(40px)', bottom: -30, right: -20 }} />

      {/* Main emoji — floating */}
      <div style={{
        fontSize: 72,
        filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))',
        animation: 'illustFloat 3s ease-in-out infinite',
        position: 'relative', zIndex: 1,
      }}>
        {mainEmoji}
      </div>

      {/* Accent emoji */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, position: 'relative', zIndex: 1 }}>
        {accentEmoji.map((e, i) => (
          <span key={i} style={{
            fontSize: 28, opacity: 0.7,
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))',
            animation: `illustFloat ${2.5 + i * 0.4}s ease-in-out infinite ${i * 0.3}s`,
          }}>
            {e}
          </span>
        ))}
      </div>

      {/* Scene label */}
      <div style={{
        position: 'absolute', bottom: 12,
        fontSize: 10, fontWeight: 700,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: '1.5px', textTransform: 'uppercase',
      }}>
        Page {pageNumber}
      </div>

      <style>{`
        @keyframes illustFloat {
          0%,100% { transform: translateY(0) rotate(-2deg); }
          50%      { transform: translateY(-10px) rotate(2deg); }
        }
      `}</style>
    </div>
  );
}
