import { Router, Response } from 'express';
import { db } from '../db/client.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (_req: AuthRequest, res: Response): void => {
  const now = Date.now();
  const day7ago = now - 7 * 24 * 60 * 60 * 1000;
  const day30ago = now - 30 * 24 * 60 * 60 * 1000;

  // D7 retention: % of users registered 7-14 days ago who were active in last 7 days
  const registered7to14 = (db.prepare(
    'SELECT COUNT(*) as c FROM parents WHERE created_at BETWEEN ? AND ?'
  ).get(now - 14 * 24 * 60 * 60 * 1000, day7ago) as { c: number }).c;

  const active7days = (db.prepare(
    'SELECT COUNT(DISTINCT parent_id) as c FROM app_sessions WHERE started_at > ?'
  ).get(day7ago) as { c: number }).c;

  const d7Retention = registered7to14 > 0
    ? Math.round((active7days / registered7to14) * 100)
    : null;

  // Stories generated per user per week (last 30 days)
  const storiesLast30 = (db.prepare(
    'SELECT COUNT(*) as c FROM stories WHERE created_at > ? AND status = "ready"'
  ).get(day30ago) as { c: number }).c;
  const activeUsersLast30 = (db.prepare(
    'SELECT COUNT(DISTINCT parent_id) as c FROM app_sessions WHERE started_at > ?'
  ).get(day30ago) as { c: number }).c;
  const weeksIn30 = 30 / 7;
  const storiesPerUserPerWeek = activeUsersLast30 > 0
    ? Math.round((storiesLast30 / activeUsersLast30 / weeksIn30) * 10) / 10
    : 0;

  // Average session length (last 30 days, completed sessions only)
  const avgSessionMs = (db.prepare(
    'SELECT AVG(duration_ms) as avg FROM app_sessions WHERE started_at > ? AND duration_ms IS NOT NULL'
  ).get(day30ago) as { avg: number | null }).avg;

  // Story generation latency percentiles
  const latencies = db.prepare(
    'SELECT llm_latency_ms FROM stories WHERE llm_latency_ms IS NOT NULL ORDER BY llm_latency_ms'
  ).all() as { llm_latency_ms: number }[];

  const p = (arr: number[], pct: number) => {
    if (arr.length === 0) return null;
    const idx = Math.ceil((pct / 100) * arr.length) - 1;
    return arr[Math.max(0, idx)];
  };
  const latencyValues = latencies.map((r) => r.llm_latency_ms);
  const latencyP50 = p(latencyValues, 50);
  const latencyP95 = p(latencyValues, 95);

  // Content safety pass rate
  const totalModerations = (db.prepare(
    'SELECT COUNT(*) as c FROM stories WHERE prompt_moderation_passed IS NOT NULL'
  ).get() as { c: number }).c;
  const blocked = (db.prepare(
    'SELECT COUNT(*) as c FROM events WHERE name = "content_moderation_blocked"'
  ).get() as { c: number }).c;
  const safetyPassRate = totalModerations > 0
    ? Math.round(((totalModerations - blocked) / totalModerations) * 10000) / 100
    : null;

  // Total cost tracking
  const costRow = db.prepare(
    'SELECT SUM(estimated_cost_usd) as total FROM stories WHERE estimated_cost_usd IS NOT NULL'
  ).get() as { total: number | null };
  const totalCostUsd = costRow.total ?? 0;

  const cost7dRow = db.prepare(
    'SELECT SUM(estimated_cost_usd) as total FROM stories WHERE estimated_cost_usd IS NOT NULL AND created_at > ?'
  ).get(day7ago) as { total: number | null };
  const cost7dUsd = cost7dRow.total ?? 0;

  const totalStories = (db.prepare('SELECT COUNT(*) as c FROM stories WHERE status = "ready"').get() as { c: number }).c;
  const avgCostPerStory = totalStories > 0 ? totalCostUsd / totalStories : 0;

  // Total users and stories
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM parents').get() as { c: number }).c;
  const totalChildren = (db.prepare('SELECT COUNT(*) as c FROM children').get() as { c: number }).c;

  // Stories generated last 7 days
  const storiesLast7 = (db.prepare(
    'SELECT COUNT(*) as c FROM stories WHERE created_at > ? AND status = "ready"'
  ).get(day7ago) as { c: number }).c;

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
