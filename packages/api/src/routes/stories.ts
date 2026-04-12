import { Router, Response } from 'express';
import { z } from 'zod';
import { ulid } from 'ulid';
import { db } from '../db/client.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { generateStory } from '../services/story-gen.js';
import { trackEvent, incrementSessionStories, incrementSessionPages } from '../services/telemetry.js';

const router = Router();
router.use(requireAuth);

const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_STORY_LIMIT || '3');
const FREE_MAX_SAVED = parseInt(process.env.FREE_MAX_SAVED_STORIES || '10');

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

function getQuotaUsed(parentId: string): number {
  const row = db.prepare(
    'SELECT stories_generated FROM daily_quotas WHERE parent_id = ? AND date = ?'
  ).get(parentId, getTodayDate()) as { stories_generated: number } | undefined;
  return row?.stories_generated ?? 0;
}

function incrementQuota(parentId: string): void {
  db.prepare(`
    INSERT INTO daily_quotas (parent_id, date, stories_generated)
    VALUES (?, ?, 1)
    ON CONFLICT(parent_id, date) DO UPDATE SET stories_generated = stories_generated + 1
  `).run(parentId, getTodayDate());
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
  const child = db.prepare(
    'SELECT id, name, age, avatar, interests, name_pronunciation FROM children WHERE id = ? AND parent_id = ?'
  ).get(childId, req.parentId) as {
    id: string; name: string; age: number; avatar: string;
    interests: string; name_pronunciation: string | null;
  } | undefined;

  if (!child) {
    res.status(404).json({ error: 'Child not found' });
    return;
  }

  // Quota check (free tier)
  const parent = db.prepare('SELECT tier FROM parents WHERE id = ?').get(req.parentId) as { tier: string } | undefined;
  const isPremium = parent?.tier === 'premium';
  const quotaUsed = getQuotaUsed(req.parentId!);
  const quotaRemaining = isPremium ? 999 : Math.max(0, FREE_DAILY_LIMIT - quotaUsed);

  // Daily limit check disabled for testing

  // Free tier: prune oldest non-favorite story if at limit
  if (!isPremium) {
    const savedCount = (db.prepare(
      "SELECT COUNT(*) as c FROM stories WHERE child_id = ? AND status = 'ready'"
    ).get(childId) as { c: number }).c;
    if (savedCount >= FREE_MAX_SAVED) {
      const oldest = db.prepare(
        "SELECT id FROM stories WHERE child_id = ? AND is_favorite = 0 AND status = 'ready' ORDER BY created_at ASC LIMIT 1"
      ).get(childId) as { id: string } | undefined;
      if (oldest) {
        db.prepare('DELETE FROM stories WHERE id = ?').run(oldest.id);
      }
    }
  }

  // Create the story record
  const storyId = ulid();
  const now = Date.now();
  db.prepare(`
    INSERT INTO stories (id, child_id, parent_id, title, theme_prompt, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'generating', ?, ?)
  `).run(storyId, childId, req.parentId, 'Generating your story...', themePrompt ?? null, now, now);

  incrementQuota(req.parentId!);
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
      db.prepare(`
        UPDATE stories SET
          title = ?, status = 'ready', word_count = ?, page_count = ?,
          llm_model = 'claude-sonnet-4-5', llm_prompt_tokens = ?, llm_completion_tokens = ?,
          llm_latency_ms = ?, prompt_moderation_passed = ?, output_moderation_passed = ?,
          estimated_cost_usd = ?, updated_at = ?
        WHERE id = ?
      `).run(
        story.title, wordCount, story.pages.length,
        promptTokens, completionTokens, latencyMs,
        promptModPassed ? 1 : 0, outputModPassed ? 1 : 0,
        estimatedCostUsd, Date.now(), storyId
      );

      for (let i = 0; i < story.pages.length; i++) {
        const page = story.pages[i];
        db.prepare(`
          INSERT INTO story_pages (id, story_id, page_number, text, illustration_prompt, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(ulid(), storyId, i + 1, page.text, page.illustrationPrompt, Date.now());
      }

      // Save theme for variation tracking
      db.prepare(
        'INSERT INTO story_themes (child_id, title, theme_summary, created_at) VALUES (?, ?, ?, ?)'
      ).run(childId, story.title, story.themeSummary, Date.now());

      emitSSE(storyId, { type: 'story_complete', storyId, title: story.title, pageCount: story.pages.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[stories] Generation failed:', message);

      if (message.startsWith('MODERATION_BLOCKED:')) {
        db.prepare("UPDATE stories SET status = 'failed', updated_at = ? WHERE id = ?").run(Date.now(), storyId);
        emitSSE(storyId, { type: 'error', message: 'Your theme prompt was flagged by our safety filter. Please try a different theme!', recoverable: true });
      } else {
        db.prepare("UPDATE stories SET status = 'failed', updated_at = ? WHERE id = ?").run(Date.now(), storyId);
        emitSSE(storyId, { type: 'error', message: 'Story generation failed. Please try again!', recoverable: true });
      }
    }
  });
});

// GET /api/stories/:id/events — SSE stream
router.get('/:id/events', (req: AuthRequest, res: Response): void => {
  const id = String(req.params.id);

  // Verify ownership
  const story = db.prepare('SELECT status FROM stories WHERE id = ? AND parent_id = ?').get(id, req.parentId) as
    | { status: string } | undefined;
  if (!story) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }

  // If already complete, send immediately
  if (story.status === 'ready') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const fullStory = db.prepare('SELECT title, page_count FROM stories WHERE id = ?').get(id) as
      { title: string; page_count: number };
    res.write(`data: ${JSON.stringify({ type: 'story_complete', storyId: id, title: fullStory.title, pageCount: fullStory.page_count })}\n\n`);
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
router.get('/:id', (req: AuthRequest, res: Response): void => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ? AND parent_id = ?').get(
    String(req.params.id), req.parentId
  ) as Record<string, unknown> | undefined;

  if (!story) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }

  const pages = db.prepare(
    'SELECT id, page_number, text, illustration_prompt FROM story_pages WHERE story_id = ? ORDER BY page_number'
  ).all(String(req.params.id)) as Array<{ id: string; page_number: number; text: string; illustration_prompt: string }>;

  const child = db.prepare('SELECT id, name, avatar FROM children WHERE id = ?').get(story.child_id as string) as
    { id: string; name: string; avatar: string } | undefined;

  res.json({ ...story, pages, child });
});

// GET /api/children/:childId/stories
router.get('/by-child/:childId', (req: AuthRequest, res: Response): void => {
  // Verify ownership
  const child = db.prepare('SELECT id FROM children WHERE id = ? AND parent_id = ?').get(
    req.params.childId, req.parentId
  ) as { id: string } | undefined;
  if (!child) {
    res.status(404).json({ error: 'Child not found' });
    return;
  }

  const page = parseInt(String(req.query.page) || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  const stories = db.prepare(`
    SELECT id, title, status, is_favorite, page_count, word_count, created_at, updated_at
    FROM stories WHERE child_id = ? AND status = 'ready'
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(req.params.childId, limit, offset) as Array<Record<string, unknown>>;

  const total = (db.prepare("SELECT COUNT(*) as c FROM stories WHERE child_id = ? AND status = 'ready'").get(req.params.childId) as { c: number }).c;

  res.json({ stories, total, page, limit });
});

// PATCH /api/stories/:id/favorite
router.patch('/:id/favorite', (req: AuthRequest, res: Response): void => {
  const story = db.prepare('SELECT id, is_favorite FROM stories WHERE id = ? AND parent_id = ?').get(
    req.params.id, req.parentId
  ) as { id: string; is_favorite: number } | undefined;

  if (!story) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }

  const newFav = story.is_favorite ? 0 : 1;
  db.prepare('UPDATE stories SET is_favorite = ?, updated_at = ? WHERE id = ?').run(newFav, Date.now(), String(req.params.id));

  if (newFav) {
    trackEvent({ name: 'story_favorited', parentId: req.parentId, storyId: String(req.params.id) });
  }

  res.json({ isFavorite: newFav === 1 });
});

// DELETE /api/stories/:id
router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const story = db.prepare('SELECT id FROM stories WHERE id = ? AND parent_id = ?').get(
    req.params.id, req.parentId
  ) as { id: string } | undefined;
  if (!story) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }
  db.prepare('DELETE FROM stories WHERE id = ?').run(req.params.id);
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
router.get('/quota/today', (req: AuthRequest, res: Response): void => {
  const used = getQuotaUsed(req.parentId!);
  // Limit disabled for testing — treat everyone as premium
  res.json({ used, limit: null, remaining: null, isPremium: true });
});

export default router;
