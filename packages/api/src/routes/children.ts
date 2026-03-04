import { Router, Response } from 'express';
import { z } from 'zod';
import { ulid } from 'ulid';
import { db } from '../db/client.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const MAX_FREE_CHILDREN = parseInt(process.env.FREE_MAX_CHILDREN || '2');

const AVATAR_OPTIONS = ['🦄', '🐉', '🚀', '🌙', '⭐', '🦊', '🐬', '🧚', '🦁', '🐼', '🌈', '🎠'];
const INTEREST_OPTIONS = [
  'dragons', 'magic', 'space', 'robots', 'fairies', 'ocean', 'castles',
  'animals', 'music', 'cooking', 'sports', 'dinosaurs', 'superheroes', 'art',
];

const ChildSchema = z.object({
  name: z.string().min(1).max(50),
  age: z.number().int().min(2).max(12),
  avatar: z.string().min(1).max(10),
  interests: z.array(z.string().max(30)).min(1).max(5),
  namePronunciation: z.string().max(100).optional(),
});

router.get('/', (req: AuthRequest, res: Response): void => {
  const children = db.prepare(
    'SELECT id, name, age, avatar, interests, name_pronunciation, created_at FROM children WHERE parent_id = ? ORDER BY created_at ASC'
  ).all(req.parentId) as Array<{
    id: string; name: string; age: number; avatar: string;
    interests: string; name_pronunciation: string | null; created_at: number;
  }>;

  res.json(children.map((c) => ({
    id: c.id,
    name: c.name,
    age: c.age,
    avatar: c.avatar,
    interests: JSON.parse(c.interests),
    namePronunciation: c.name_pronunciation,
    createdAt: c.created_at,
  })));
});

router.post('/', (req: AuthRequest, res: Response): void => {
  const parsed = ChildSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  // Free tier: max 2 children
  const parent = db.prepare('SELECT tier FROM parents WHERE id = ?').get(req.parentId) as
    | { tier: string } | undefined;
  const count = (db.prepare('SELECT COUNT(*) as c FROM children WHERE parent_id = ?').get(req.parentId) as { c: number }).c;
  const maxChildren = parent?.tier === 'premium' ? 999 : MAX_FREE_CHILDREN;
  if (count >= maxChildren) {
    res.status(403).json({ error: 'Profile limit reached', maxChildren });
    return;
  }

  const { name, age, avatar, interests, namePronunciation } = parsed.data;
  const id = ulid();
  const now = Date.now();

  db.prepare(`
    INSERT INTO children (id, parent_id, name, age, avatar, interests, name_pronunciation, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.parentId, name, age, avatar, JSON.stringify(interests), namePronunciation ?? null, now, now);

  res.status(201).json({ id, name, age, avatar, interests, namePronunciation: namePronunciation ?? null, createdAt: now });
});

router.put('/:id', (req: AuthRequest, res: Response): void => {
  const child = db.prepare('SELECT id FROM children WHERE id = ? AND parent_id = ?').get(
    req.params.id, req.parentId
  ) as { id: string } | undefined;
  if (!child) {
    res.status(404).json({ error: 'Child not found' });
    return;
  }

  const parsed = ChildSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { name, age, avatar, interests, namePronunciation } = parsed.data;
  const now = Date.now();

  if (name !== undefined) db.prepare('UPDATE children SET name = ?, updated_at = ? WHERE id = ?').run(name, now, req.params.id);
  if (age !== undefined) db.prepare('UPDATE children SET age = ?, updated_at = ? WHERE id = ?').run(age, now, req.params.id);
  if (avatar !== undefined) db.prepare('UPDATE children SET avatar = ?, updated_at = ? WHERE id = ?').run(avatar, now, req.params.id);
  if (interests !== undefined) db.prepare('UPDATE children SET interests = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(interests), now, req.params.id);
  if (namePronunciation !== undefined) db.prepare('UPDATE children SET name_pronunciation = ?, updated_at = ? WHERE id = ?').run(namePronunciation, now, req.params.id);

  const updated = db.prepare('SELECT * FROM children WHERE id = ?').get(req.params.id) as {
    id: string; name: string; age: number; avatar: string; interests: string;
    name_pronunciation: string | null; created_at: number;
  };
  res.json({
    id: updated.id, name: updated.name, age: updated.age, avatar: updated.avatar,
    interests: JSON.parse(updated.interests), namePronunciation: updated.name_pronunciation,
    createdAt: updated.created_at,
  });
});

router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const child = db.prepare('SELECT id FROM children WHERE id = ? AND parent_id = ?').get(
    req.params.id, req.parentId
  ) as { id: string } | undefined;
  if (!child) {
    res.status(404).json({ error: 'Child not found' });
    return;
  }
  db.prepare('DELETE FROM children WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/options', (_req: AuthRequest, res: Response): void => {
  res.json({ avatars: AVATAR_OPTIONS, interests: INTEREST_OPTIONS });
});

export default router;
