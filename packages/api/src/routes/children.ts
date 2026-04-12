import { Router, Response } from 'express';
import { z } from 'zod';
import { ulid } from 'ulid';
import { query, queryOne, execute } from '../db/client.js';
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

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const children = await query<{
    id: string; name: string; age: number; avatar: string;
    interests: string; name_pronunciation: string | null; created_at: number;
  }>(
    'SELECT id, name, age, avatar, interests, name_pronunciation, created_at FROM children WHERE parent_id = $1 ORDER BY created_at ASC',
    [req.parentId]
  );

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

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = ChildSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  // Free tier: max 2 children
  const parent = await queryOne<{ tier: string }>(
    'SELECT tier FROM parents WHERE id = $1',
    [req.parentId]
  );
  const countRow = await queryOne<{ c: string }>(
    'SELECT COUNT(*) as c FROM children WHERE parent_id = $1',
    [req.parentId]
  );
  const count = Number(countRow?.c ?? 0);
  const maxChildren = parent?.tier === 'premium' ? 999 : MAX_FREE_CHILDREN;
  if (count >= maxChildren) {
    res.status(403).json({ error: 'Profile limit reached', maxChildren });
    return;
  }

  const { name, age, avatar, interests, namePronunciation } = parsed.data;
  const id = ulid();
  const now = Date.now();

  await execute(
    `INSERT INTO children (id, parent_id, name, age, avatar, interests, name_pronunciation, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, req.parentId, name, age, avatar, JSON.stringify(interests), namePronunciation ?? null, now, now]
  );

  res.status(201).json({ id, name, age, avatar, interests, namePronunciation: namePronunciation ?? null, createdAt: now });
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const child = await queryOne<{ id: string }>(
    'SELECT id FROM children WHERE id = $1 AND parent_id = $2',
    [req.params.id, req.parentId]
  );
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

  if (name !== undefined) await execute('UPDATE children SET name = $1, updated_at = $2 WHERE id = $3', [name, now, req.params.id]);
  if (age !== undefined) await execute('UPDATE children SET age = $1, updated_at = $2 WHERE id = $3', [age, now, req.params.id]);
  if (avatar !== undefined) await execute('UPDATE children SET avatar = $1, updated_at = $2 WHERE id = $3', [avatar, now, req.params.id]);
  if (interests !== undefined) await execute('UPDATE children SET interests = $1, updated_at = $2 WHERE id = $3', [JSON.stringify(interests), now, req.params.id]);
  if (namePronunciation !== undefined) await execute('UPDATE children SET name_pronunciation = $1, updated_at = $2 WHERE id = $3', [namePronunciation, now, req.params.id]);

  const updated = await queryOne<{
    id: string; name: string; age: number; avatar: string; interests: string;
    name_pronunciation: string | null; created_at: number;
  }>('SELECT * FROM children WHERE id = $1', [req.params.id]);
  res.json({
    id: updated!.id, name: updated!.name, age: updated!.age, avatar: updated!.avatar,
    interests: JSON.parse(updated!.interests), namePronunciation: updated!.name_pronunciation,
    createdAt: updated!.created_at,
  });
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const child = await queryOne<{ id: string }>(
    'SELECT id FROM children WHERE id = $1 AND parent_id = $2',
    [req.params.id, req.parentId]
  );
  if (!child) {
    res.status(404).json({ error: 'Child not found' });
    return;
  }
  await execute('DELETE FROM children WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.get('/options', (_req: AuthRequest, res: Response): void => {
  res.json({ avatars: AVATAR_OPTIONS, interests: INTEREST_OPTIONS });
});

export default router;
