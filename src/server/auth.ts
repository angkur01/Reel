import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { loadDb, saveDb } from './db.js';

// Secret key for HMAC token signing
const HMAC_SECRET = process.env.ADMIN_SESSION_SECRET || 'reel-tracker-hmac-master-key-2026';

export function verifyPassword(password: string): boolean {
  const db = loadDb();
  return bcrypt.compareSync(password, db.auth.adminPasswordHash);
}

export function setPassword(newPassword: string): void {
  const db = loadDb();
  db.auth.adminPasswordHash = bcrypt.hashSync(newPassword, 10);
  saveDb(db);
}

export function createSessionToken(): string {
  const db = loadDb();
  const timestamp = Date.now();
  const passHashSnippet = (db.auth.adminPasswordHash || 'default').slice(-10);
  const randomPart = crypto.randomBytes(8).toString('hex');
  const payload = `${timestamp}:${randomPart}:${passHashSnippet}`;
  const signature = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  const token = `${payload}:${signature}`;

  if (!db.auth.sessions) {
    db.auth.sessions = {};
  }
  db.auth.sessions[token] = timestamp;
  saveDb(db);

  return token;
}

export function isValidSession(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;

  const cleanToken = token.trim();
  if (!cleanToken || cleanToken === 'null' || cleanToken === 'undefined') return false;

  // 1. Verify stateless HMAC signed token
  try {
    const parts = cleanToken.split(':');
    if (parts.length === 4) {
      const [timestampStr, randomPart, passHashSnippet, signature] = parts;
      const timestamp = parseInt(timestampStr, 10);

      if (!isNaN(timestamp)) {
        const payload = `${timestampStr}:${randomPart}:${passHashSnippet}`;
        const expectedSignature = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');

        // Constant time signature comparison
        const sigBuf = Buffer.from(signature, 'hex');
        const expectedBuf = Buffer.from(expectedSignature, 'hex');

        if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
          // Check expiration (365 days)
          const MAX_AGE = 365 * 24 * 60 * 60 * 1000;
          if (Date.now() - timestamp < MAX_AGE && timestamp <= Date.now() + 300000) {
            return true;
          }
        }
      }
    }
  } catch (e) {
    // Fall through to DB check
  }

  // 2. Check in-memory / DB session table
  const db = loadDb();
  const sessions = db.auth?.sessions || {};
  const lastActiveAt = sessions[cleanToken];
  if (lastActiveAt) {
    const MAX_AGE = 365 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastActiveAt < MAX_AGE) {
      return true;
    }
  }

  return false;
}

export function revokeSession(token: string): void {
  const db = loadDb();
  if (db.auth.sessions && db.auth.sessions[token]) {
    delete db.auth.sessions[token];
    saveDb(db);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined = undefined;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies.admin_session) {
    token = req.cookies.admin_session;
  }

  if (isValidSession(token)) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized. Admin login required.' });
  }
}

