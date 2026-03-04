import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './data/dreamy-tales.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -32000');
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');

// Run each DDL statement individually (better-sqlite3 prepare is single-statement)
const ddl = [
  `CREATE TABLE IF NOT EXISTS parents (
    id                       TEXT    PRIMARY KEY,
    email                    TEXT    UNIQUE NOT NULL,
    password_hash            TEXT    NOT NULL,
    display_name             TEXT    NOT NULL,
    tier                     TEXT    NOT NULL DEFAULT 'free',
    trial_ends_at            INTEGER,
    created_at               INTEGER NOT NULL,
    updated_at               INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id                       TEXT    PRIMARY KEY,
    parent_id                TEXT    NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    token_hash               TEXT    UNIQUE NOT NULL,
    expires_at               INTEGER NOT NULL,
    created_at               INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token  ON sessions(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id)`,
  `CREATE TABLE IF NOT EXISTS children (
    id                       TEXT    PRIMARY KEY,
    parent_id                TEXT    NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    name                     TEXT    NOT NULL,
    age                      INTEGER NOT NULL,
    avatar                   TEXT    NOT NULL,
    interests                TEXT    NOT NULL DEFAULT '[]',
    name_pronunciation       TEXT,
    created_at               INTEGER NOT NULL,
    updated_at               INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_children_parent ON children(parent_id)`,
  `CREATE TABLE IF NOT EXISTS stories (
    id                       TEXT    PRIMARY KEY,
    child_id                 TEXT    NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    parent_id                TEXT    NOT NULL REFERENCES parents(id),
    title                    TEXT    NOT NULL,
    theme_prompt             TEXT,
    status                   TEXT    NOT NULL DEFAULT 'generating',
    is_favorite              INTEGER NOT NULL DEFAULT 0,
    word_count               INTEGER,
    page_count               INTEGER,
    llm_model                TEXT,
    llm_prompt_tokens        INTEGER,
    llm_completion_tokens    INTEGER,
    llm_latency_ms           INTEGER,
    prompt_moderation_passed INTEGER,
    output_moderation_passed INTEGER,
    estimated_cost_usd       REAL,
    created_at               INTEGER NOT NULL,
    updated_at               INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stories_child  ON stories(child_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_stories_parent ON stories(parent_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status)`,
  `CREATE TABLE IF NOT EXISTS story_pages (
    id                       TEXT    PRIMARY KEY,
    story_id                 TEXT    NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    page_number              INTEGER NOT NULL,
    text                     TEXT    NOT NULL,
    illustration_prompt      TEXT,
    created_at               INTEGER NOT NULL,
    UNIQUE(story_id, page_number)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pages_story ON story_pages(story_id, page_number)`,
  `CREATE TABLE IF NOT EXISTS daily_quotas (
    parent_id                TEXT    NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    date                     TEXT    NOT NULL,
    stories_generated        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (parent_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS story_themes (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id                 TEXT    NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    title                    TEXT    NOT NULL,
    theme_summary            TEXT    NOT NULL,
    created_at               INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_themes_child ON story_themes(child_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS events (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    name                     TEXT    NOT NULL,
    parent_id                TEXT,
    child_id                 TEXT,
    story_id                 TEXT,
    app_session_id           TEXT,
    properties               TEXT    NOT NULL DEFAULT '{}',
    ts                       INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_name   ON events(name, ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_events_parent ON events(parent_id, ts DESC)`,
  `CREATE TABLE IF NOT EXISTS app_sessions (
    id                       TEXT    PRIMARY KEY,
    parent_id                TEXT    NOT NULL REFERENCES parents(id),
    started_at               INTEGER NOT NULL,
    ended_at                 INTEGER,
    duration_ms              INTEGER,
    stories_generated        INTEGER NOT NULL DEFAULT 0,
    pages_read               INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_app_sessions_parent ON app_sessions(parent_id, started_at DESC)`,
];

for (const stmt of ddl) {
  db.prepare(stmt).run();
}

console.log(`[db] Connected to SQLite at ${dbPath}`);
