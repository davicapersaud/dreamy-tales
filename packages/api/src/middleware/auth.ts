import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/client.js';

export interface AuthRequest extends Request {
  parentId?: string;
  appSessionId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const secret = process.env.SESSION_SECRET!;
    const payload = jwt.verify(token, secret) as { sub: string; sid: string };
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const session = db.prepare(
      'SELECT id FROM sessions WHERE token_hash = ? AND expires_at > ?'
    ).get(tokenHash, Date.now()) as { id: string } | undefined;

    if (!session) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    req.parentId = payload.sub;
    req.appSessionId = payload.sid;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
