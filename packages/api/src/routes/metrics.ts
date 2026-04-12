import { Router, Response } from 'express';
import { query, queryOne } from '../db/client.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const now = Date.now();
  const day7ago = now - 7 * 24 * 60 * 60 * 1000;
  const day30ago = now - 30 * 24 * 60 * 60 * 1000;

  // D7 retention: % of users registered 7-14 days ago who were active in last 7 days
  const reg7to14Row = await queryOne<{ c: string }>(
    'SELECT COUNT(*) as c FROM parents WHERE created_at BETWEEN $1 AND $2',
    [now - 14 * 24 * 60 * 60 * 1000, day7ago]
  );
  const registered7to14 = Number(reg7to14Row?.c ?? 0);

  const active7Row = await queryOne<{ c: string }>(
    'SELECT COUNT(DISTINCT parent_id) as c FROM app_sessions WHERE started_at > $1',
    [day7ago]
  );
  const active7days = Number(active7Row?.c ?? 0);

  const d7Retention = registered7to14 > 0
    ? Math.round((active7days / registered7to14) * 100)
    : null;

  // Stories generated per user per week (last 30 days)
  const stories30Row = await queryOne<{ c: string }>(
    "SELECT COUNT(*) as c FROM stories WHERE created_at > $1 AND status = 'ready'",
    [day30ago]
  );
  const storiesLast30 = Number(stories30Row?.c ?? 0);

  const activeUsers30Row = await queryOne<{ c: string }>(
    'SELECT COUNT(DISTINCT parent_id) as c FROM app_sessions WHERE started_at > $1',
    [day30ago]
  );
  const activeUsersLast30 = Number(activeUsers30Row?.c ?? 0);

  const weeksIn30 = 30 / 7;
  const storiesPerUserPerWeek = activeUsersLast30 > 0
    ? Math.round((storiesLast30 / activeUsersLast30 / weeksIn30) * 10) / 10
    : 0;

  // Average session length (last 30 days, completed sessions only)
  const avgRow = await queryOne<{ avg: string | null }>(
    'SELECT AVG(duration_ms) as avg FROM app_sessions WHERE started_at > $1 AND duration_ms IS NOT NULL',
    [day30ago]
  );
  const avgSessionMs = avgRow?.avg != null ? Number(avgRow.avg) : null;

  // Story generation latency percentiles
  const latencies = await query<{ llm_latency_ms: number }>(
    'SELECT llm_latency_ms FROM stories WHERE llm_latency_ms IS NOT NULL ORDER BY llm_latency_ms'
  );

  const p = (arr: number[], pct: number) => {
    if (arr.length === 0) return null;
    const idx = Math.ceil((pct / 100) * arr.length) - 1;
    return arr[Math.max(0, idx)];
  };
  const latencyValues = latencies.map((r) => r.llm_latency_ms);
  const latencyP50 = p(latencyValues, 50);
  const latencyP95 = p(latencyValues, 95);

  // Content safety pass rate
  const totalModRow = await queryOne<{ c: string }>(
    'SELECT COUNT(*) as c FROM stories WHERE prompt_moderation_passed IS NOT NULL'
  );
  const totalModerations = Number(totalModRow?.c ?? 0);

  const blockedRow = await queryOne<{ c: string }>(
    "SELECT COUNT(*) as c FROM events WHERE name = 'content_moderation_blocked'"
  );
  const blocked = Number(blockedRow?.c ?? 0);

  const safetyPassRate = totalModerations > 0
    ? Math.round(((totalModerations - blocked) / totalModerations) * 10000) / 100
    : null;

  // Total cost tracking
  const costRow = await queryOne<{ total: string | null }>(
    'SELECT SUM(estimated_cost_usd) as total FROM stories WHERE estimated_cost_usd IS NOT NULL'
  );
  const totalCostUsd = costRow?.total != null ? Number(costRow.total) : 0;

  const cost7dRow = await queryOne<{ total: string | null }>(
    'SELECT SUM(estimated_cost_usd) as total FROM stories WHERE estimated_cost_usd IS NOT NULL AND created_at > $1',
    [day7ago]
  );
  const cost7dUsd = cost7dRow?.total != null ? Number(cost7dRow.total) : 0;

  const totalStoriesRow = await queryOne<{ c: string }>(
    "SELECT COUNT(*) as c FROM stories WHERE status = 'ready'"
  );
  const totalStories = Number(totalStoriesRow?.c ?? 0);
  const avgCostPerStory = totalStories > 0 ? totalCostUsd / totalStories : 0;

  // Total users and stories
  const usersRow = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM parents');
  const totalUsers = Number(usersRow?.c ?? 0);

  const childrenRow = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM children');
  const totalChildren = Number(childrenRow?.c ?? 0);

  // Stories generated last 7 days
  const stories7Row = await queryOne<{ c: string }>(
    "SELECT COUNT(*) as c FROM stories WHERE created_at > $1 AND status = 'ready'",
    [day7ago]
  );
  const storiesLast7 = Number(stories7Row?.c ?? 0);

  res.json({
    retention: { d7: d7Retention },
    storiesPerUserPerWeek,
    avgSessionLengthMs: avgSessionMs ? Math.round(avgSessionMs) : null,
    avgSessionLengthMin: avgSessionMs ? Math.round(avgSessionMs / 60000 * 10) / 10 : null,
    storyGenerationLatency: { p50Ms: latencyP50, p95Ms: latencyP95 },
    contentSafetyPassRate: safetyPassRate,
    totalApiCostUsd: Math.round(totalCostUsd * 10000) / 10000,
    avgCostPerStoryUsd: Math.round(avgCostPerStory * 10000) / 10000,
    costLast7DaysUsd: Math.round(cost7dUsd * 10000) / 10000,
    totals: { users: totalUsers, children: totalChildren, stories: totalStories, storiesLast7 },
  });
});

export default router;
