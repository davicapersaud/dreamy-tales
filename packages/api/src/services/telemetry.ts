import { db } from '../db/client.js';

interface EventPayload {
  name: string;
  parentId?: string;
  childId?: string;
  storyId?: string;
  appSessionId?: string;
  properties?: Record<string, unknown>;
}

export function trackEvent(payload: EventPayload): void {
  try {
    db.prepare(`
      INSERT INTO events (name, parent_id, child_id, story_id, app_session_id, properties, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.name,
      payload.parentId ?? null,
      payload.childId ?? null,
      payload.storyId ?? null,
      payload.appSessionId ?? null,
      JSON.stringify(payload.properties ?? {}),
      Date.now()
    );
  } catch (err) {
    // Telemetry failures must never crash the app
    console.error('[telemetry] Failed to track event:', err);
  }
}

export function startAppSession(parentId: string, sessionId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO app_sessions (id, parent_id, started_at) VALUES (?, ?, ?)'
  ).run(sessionId, parentId, Date.now());
}

export function endAppSession(sessionId: string): void {
  const session = db.prepare('SELECT started_at FROM app_sessions WHERE id = ?').get(sessionId) as
    | { started_at: number }
    | undefined;
  if (!session) return;
  const duration = Date.now() - session.started_at;
  db.prepare('UPDATE app_sessions SET ended_at = ?, duration_ms = ? WHERE id = ?').run(
    Date.now(), duration, sessionId
  );
}

export function incrementSessionPages(sessionId: string): void {
  db.prepare('UPDATE app_sessions SET pages_read = pages_read + 1 WHERE id = ?').run(sessionId);
}

export function incrementSessionStories(sessionId: string): void {
  db.prepare(
    'UPDATE app_sessions SET stories_generated = stories_generated + 1 WHERE id = ?'
  ).run(sessionId);
}
