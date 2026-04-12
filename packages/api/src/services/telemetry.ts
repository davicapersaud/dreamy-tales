import { execute, queryOne } from '../db/client.js';

interface EventPayload {
  name: string;
  parentId?: string;
  childId?: string;
  storyId?: string;
  appSessionId?: string;
  properties?: Record<string, unknown>;
}

export function trackEvent(payload: EventPayload): void {
  execute(`
    INSERT INTO events (name, parent_id, child_id, story_id, app_session_id, properties, ts)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    payload.name,
    payload.parentId ?? null,
    payload.childId ?? null,
    payload.storyId ?? null,
    payload.appSessionId ?? null,
    JSON.stringify(payload.properties ?? {}),
    Date.now(),
  ]).catch((err) => console.error('[telemetry] Failed to track event:', err));
}

export function startAppSession(parentId: string, sessionId: string): void {
  execute(
    'INSERT INTO app_sessions (id, parent_id, started_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [sessionId, parentId, Date.now()]
  ).catch((err) => console.error('[telemetry] startAppSession failed:', err));
}

export function endAppSession(sessionId: string): void {
  (async () => {
    const session = await queryOne<{ started_at: number }>(
      'SELECT started_at FROM app_sessions WHERE id = $1',
      [sessionId]
    );
    if (!session) return;
    const duration = Date.now() - Number(session.started_at);
    await execute(
      'UPDATE app_sessions SET ended_at = $1, duration_ms = $2 WHERE id = $3',
      [Date.now(), duration, sessionId]
    );
  })().catch((err) => console.error('[telemetry] endAppSession failed:', err));
}

export function incrementSessionPages(sessionId: string): void {
  execute(
    'UPDATE app_sessions SET pages_read = pages_read + 1 WHERE id = $1',
    [sessionId]
  ).catch((err) => console.error('[telemetry] incrementSessionPages failed:', err));
}

export function incrementSessionStories(sessionId: string): void {
  execute(
    'UPDATE app_sessions SET stories_generated = stories_generated + 1 WHERE id = $1',
    [sessionId]
  ).catch((err) => console.error('[telemetry] incrementSessionStories failed:', err));
}
