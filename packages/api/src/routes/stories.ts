import { Router, Response } from 'express';
import { z } from 'zod';
import { ulid } from 'ulid';
import { query, queryOne, execute } from '../db/client.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { generateStory } from '../services/story-gen.js';
import { trackEvent, incrementSessionStories, incrementSessionPages } from '../services/telemetry.js';

const router = Router();
router.use(requireAuth);

const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_STORY_LIMIT || '20');
const FREE_MAX_SAVED = parseInt(process.env.FREE_MAX_SAVED_STORIES || '30');
const GLOBAL_DAILY_LIMIT = parseInt(process.env.GLOBAL_DAILY_STORY_LIMIT || '500');

// In-memory SSE clients: storyId → Set of res objects
const sseClients: Map<string, Set<Response>> = new Map();

function emitSSE(storyId: string, data: object): void {
  const clients = sseClients.get(storyId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => {
    try { client.write(payload); } catch { /* client disconnected */ }
  });
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getQuotaUsed(parentId: string): Promise<number> {
  const row = await queryOne<{ stories_generated: number }>(
    'SELECT stories_generated FROM daily_quotas WHERE parent_id = $1 AND date = $2',
    [parentId, getTodayDate()]
  );
  return row?.stories_generated ?? 0;
}

async function getGlobalQuotaUsed(): Promise<number> {
  const row = await queryOne<{ total: string }>(
    'SELECT COALESCE(SUM(stories_generated), 0) as total FROM daily_quotas WHERE date = $1',
    [getTodayDate()]
  );
  return Number(row?.total ?? 0);
}

async function incrementQuota(parentId: string): Promise<void> {
  await execute(`
    INSERT INTO daily_quotas (parent_id, date, stories_generated)
    VALUES ($1, $2, 1)
    ON CONFLICT (parent_id, date) DO UPDATE SET stories_generated = daily_quotas.stories_generated + 1
  `, [parentId, getTodayDate()]);
}

// POST /api/stories/generate
router.post('/generate', async (req: AuthRequest, res: Response): Promise<void> => {
  const schema = z.object({
    childId: z.string(),
    themePrompt: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const { childId, themePrompt } = parsed.data;

  // Verify child belongs to parent
  const child = await queryOne<{
    id: string; name: string; age: number; avatar: string;
    interests: string; name_pronunciation: string | null;
  }>(
    'SELECT id, name, age, avatar, interests, name_pronunciation FROM children WHERE id = $1 AND parent_id = $2',
    [childId, req.parentId]
  );

  if (!child) {
    res.status(404).json({ error: 'Child not found' });
    return;
  }

  // Quota check (free tier)
  const parent = await queryOne<{ tier: string }>(
    'SELECT tier FROM parents WHERE id = $1',
    [req.parentId]
  );
  const isPremium = parent?.tier === 'premium';
  const quotaUsed = await getQuotaUsed(req.parentId!);
  const quotaRemaining = isPremium ? 999 : Math.max(0, FREE_DAILY_LIMIT - quotaUsed);

  // Global daily cap (across all users)
  const globalUsed = await getGlobalQuotaUsed();
  if (globalUsed >= GLOBAL_DAILY_LIMIT) {
    res.status(429).json({ error: 'GLOBAL_LIMIT_REACHED', message: 'Daily story limit reached. Please come back tomorrow!' });
    return;
  }

  // Free tier: prune oldest non-favorite story if at limit
  if (!isPremium) {
    const savedCountRow = await queryOne<{ c: string }>(
      "SELECT COUNT(*) as c FROM stories WHERE child_id = $1 AND status = 'ready'",
      [childId]
    );
    const savedCount = Number(savedCountRow?.c ?? 0);
    if (savedCount >= FREE_MAX_SAVED) {
      const oldest = await queryOne<{ id: string }>(
        "SELECT id FROM stories WHERE child_id = $1 AND is_favorite = 0 AND status = 'ready' ORDER BY created_at ASC LIMIT 1",
        [childId]
      );
      if (oldest) {
        await execute('DELETE FROM stories WHERE id = $1', [oldest.id]);
      }
    }
  }

  // Create the story record
  const storyId = ulid();
  const now = Date.now();
  await execute(
    `INSERT INTO stories (id, child_id, parent_id, title, theme_prompt, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'generating', $6, $7)`,
    [storyId, childId, req.parentId, 'Generating your story...', themePrompt ?? null, now, now]
  );

  await incrementQuota(req.parentId!);
  if (req.appSessionId) incrementSessionStories(req.appSessionId);

  trackEvent({
    name: 'story_generation_started',
    parentId: req.parentId,
    childId,
    storyId,
    appSessionId: req.appSessionId,
    properties: { has_theme_prompt: !!themePrompt },
  });

  // Return immediately — client will poll SSE for progress
  res.status(202).json({ storyId, status: 'generating', quotaRemaining: quotaRemaining - 1 });

  // Generate in background (non-blocking)
  setImmediate(async () => {
    try {
      const result = await generateStory(child, themePrompt, req.parentId!, req.appSessionId);
      const { story, promptTokens, completionTokens, latencyMs, estimatedCostUsd, promptModPassed, outputModPassed } = result;

      const wordCount = story.pages.reduce((s, p) => s + p.text.split(/\s+/).length, 0);

      // Save story + pages
      await execute(`
        UPDATE stories SET
          title = $1, status = 'ready', word_count = $2, page_count = $3,
          llm_model = 'gemini-2.5-flash-lite', llm_prompt_tokens = $4, llm_completion_tokens = $5,
          llm_latency_ms = $6, prompt_moderation_passed = $7, output_moderation_passed = $8,
          estimated_cost_usd = $9, updated_at = $10
        WHERE id = $11
      `, [
        story.title, wordCount, story.pages.length,
        promptTokens, completionTokens, latencyMs,
        promptModPassed ? 1 : 0, outputModPassed ? 1 : 0,
        estimatedCostUsd, Date.now(), storyId,
      ]);

      for (let i = 0; i < story.pages.length; i++) {
        const page = story.pages[i];
        await execute(
          'INSERT INTO story_pages (id, story_id, page_number, text, illustration_prompt, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [ulid(), storyId, i + 1, page.text, page.illustrationPrompt, Date.now()]
        );
      }

      // Save theme for variation tracking
      await execute(
        'INSERT INTO story_themes (child_id, title, theme_summary, created_at) VALUES ($1, $2, $3, $4)',
        [childId, story.title, story.themeSummary, Date.now()]
      );

      emitSSE(storyId, { type: 'story_complete', storyId, title: story.title, pageCount: story.pages.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[stories] Generation failed:', message);

      if (message.startsWith('MODERATION_BLOCKED:')) {
        await execute("UPDATE stories SET status = 'failed', updated_at = $1 WHERE id = $2", [Date.now(), storyId]);
        emitSSE(storyId, { type: 'error', message: 'Your theme prompt was flagged by our safety filter. Please try a different theme!', recoverable: true });
      } else {
        await execute("UPDATE stories SET status = 'failed', updated_at = $1 WHERE id = $2", [Date.now(), storyId]);
        emitSSE(storyId, { type: 'error', message: 'Story generation failed. Please try again!', recoverable: true });
      }
    }
  });
});

// GET /api/stories/:id/events — SSE stream
router.get('/:id/events', async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);

  // Verify ownership
  const story = await queryOne<{ status: string }>(
    'SELECT status FROM stories WHERE id = $1 AND parent_id = $2',
    [id, req.parentId]
  );
  if (!story) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }

  // If already complete, send immediately
  if (story.status === 'ready') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const fullStory = await queryOne<{ title: string; page_count: number }>(
      'SELECT title, page_count FROM stories WHERE id = $1',
      [id]
    );
    res.write(`data: ${JSON.stringify({ type: 'story_complete', storyId: id, title: fullStory!.title, pageCount: fullStory!.page_count })}\n\n`);
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: ${JSON.stringify({ type: 'generating' })}\n\n`);

  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id)!.add(res);

  req.on('close', () => {
    sseClients.get(id)?.delete(res);
    if (sseClients.get(id)?.size === 0) sseClients.delete(id);
  });
});

// GET /api/stories/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const story = await queryOne<Record<string, unknown>>(
    'SELECT * FROM stories WHERE id = $1 AND parent_id = $2',
    [String(req.params.id), req.parentId]
  );

  if (!story) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }

  const pages = await query<{ id: string; page_number: number; text: string; illustration_prompt: string }>(
    'SELECT id, page_number, text, illustration_prompt FROM story_pages WHERE story_id = $1 ORDER BY page_number',
    [String(req.params.id)]
  );

  const child = await queryOne<{ id: string; name: string; avatar: string }>(
    'SELECT id, name, avatar FROM children WHERE id = $1',
    [story.child_id as string]
  );

  res.json({ ...story, pages, child });
});

// GET /api/children/:childId/stories
router.get('/by-child/:childId', async (req: AuthRequest, res: Response): Promise<void> => {
  // Verify ownership
  const child = await queryOne<{ id: string }>(
    'SELECT id FROM children WHERE id = $1 AND parent_id = $2',
    [req.params.childId, req.parentId]
  );
  if (!child) {
    res.status(404).json({ error: 'Child not found' });
    return;
  }

  const page = parseInt(String(req.query.page) || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  const stories = await query<Record<string, unknown>>(`
    SELECT id, title, status, is_favorite, page_count, word_count, created_at, updated_at
    FROM stories WHERE child_id = $1 AND status = 'ready'
    ORDER BY created_at DESC LIMIT $2 OFFSET $3
  `, [req.params.childId, limit, offset]);

  const totalRow = await queryOne<{ c: string }>(
    "SELECT COUNT(*) as c FROM stories WHERE child_id = $1 AND status = 'ready'",
    [req.params.childId]
  );
  const total = Number(totalRow?.c ?? 0);

  res.json({ stories, total, page, limit });
});

// PATCH /api/stories/:id/favorite
router.patch('/:id/favorite', async (req: AuthRequest, res: Response): Promise<void> => {
  const story = await queryOne<{ id: string; is_favorite: number }>(
    'SELECT id, is_favorite FROM stories WHERE id = $1 AND parent_id = $2',
    [req.params.id, req.parentId]
  );

  if (!story) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }

  const newFav = story.is_favorite ? 0 : 1;
  await execute(
    'UPDATE stories SET is_favorite = $1, updated_at = $2 WHERE id = $3',
    [newFav, Date.now(), String(req.params.id)]
  );

  if (newFav) {
    trackEvent({ name: 'story_favorited', parentId: req.parentId, storyId: String(req.params.id) });
  }

  res.json({ isFavorite: newFav === 1 });
});

// DELETE /api/stories/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const story = await queryOne<{ id: string }>(
    'SELECT id FROM stories WHERE id = $1 AND parent_id = $2',
    [req.params.id, req.parentId]
  );
  if (!story) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }
  await execute('DELETE FROM stories WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// POST /api/events (client-side event ingestion)
router.post('/track', (req: AuthRequest, res: Response): void => {
  const schema = z.object({
    name: z.string().max(100),
    childId: z.string().optional(),
    storyId: z.string().optional(),
    properties: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid event' }); return; }

  const { name, childId, storyId, properties } = parsed.data;

  // Track page_view events for session analytics
  if (name === 'story_page_viewed' && req.appSessionId) {
    incrementSessionPages(req.appSessionId);
  }

  trackEvent({ name, parentId: req.parentId, childId, storyId, appSessionId: req.appSessionId, properties });
  res.json({ ok: true });
});

// GET /api/stories/quota
router.get('/quota/today', async (req: AuthRequest, res: Response): Promise<void> => {
  const used = await getQuotaUsed(req.parentId!);
  // Limit disabled for testing — treat everyone as premium
  res.json({ used, limit: null, remaining: null, isPremium: true });
});

export default router;
