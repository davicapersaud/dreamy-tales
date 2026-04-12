import { Router, Request, Response } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { ulid } from 'ulid';
import { z } from 'zod';
import { db } from '../db/client.js';
import { AuthRequest } from '../middleware/auth.js';
import { trackEvent, startAppSession } from '../services/telemetry.js';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function issueToken(parentId: string, sessionId: string): string {
  return jwt.sign({ sub: parentId, sid: sessionId }, process.env.SESSION_SECRET!, {
    expiresIn: '7d',
  });
}

function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { email, password, displayName } = parsed.data;

  const existing = db.prepare('SELECT id FROM parents WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const parentId = ulid();
  const now = Date.now();
  db.prepare(`
    INSERT INTO parents (id, email, password_hash, display_name, tier, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'free', ?, ?)
  `).run(parentId, email.toLowerCase(), passwordHash, displayName, now, now);

  const sessionId = ulid();
  const token = issueToken(parentId, sessionId);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare(
    'INSERT INTO sessions (id, parent_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, parentId, tokenHash, now + 7 * 24 * 60 * 60 * 1000, now);

  startAppSession(parentId, sessionId);
  setSessionCookie(res, token);

  trackEvent({
    name: 'user_registered',
    parentId,
    appSessionId: sessionId,
    properties: { tier: 'free' },
  });

  res.status(201).json({ id: parentId, email: email.toLowerCase(), displayName, tier: 'free' });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const { email, password } = parsed.data;

  const parent = db.prepare('SELECT id, password_hash, display_name, tier FROM parents WHERE email = ?').get(
    email.toLowerCase()
  ) as { id: string; password_hash: string; display_name: string; tier: string } | undefined;

  if (!parent) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await argon2.verify(parent.password_hash, password);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const sessionId = ulid();
  const now = Date.now();
  const token = issueToken(parent.id, sessionId);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare(
    'INSERT INTO sessions (id, parent_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, parent.id, tokenHash, now + 7 * 24 * 60 * 60 * 1000, now);

  startAppSession(parent.id, sessionId);
  setSessionCookie(res, token);

  trackEvent({
    name: 'session_start',
    parentId: parent.id,
    appSessionId: sessionId,
    properties: {},
  });

  res.json({ id: parent.id, email: email.toLowerCase(), displayName: parent.display_name, tier: parent.tier });
});

router.post('/logout', (req: AuthRequest, res: Response): void => {
  const token = req.cookies?.token;
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', (req: AuthRequest, res: Response): void => {
  if (!req.parentId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const parent = db.prepare('SELECT id, email, display_name, tier FROM parents WHERE id = ?').get(
    req.parentId
  ) as { id: string; email: string; display_name: string; tier: string } | undefined;

  if (!parent) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json({ id: parent.id, email: parent.email, displayName: parent.display_name, tier: parent.tier });
});

export default router;
