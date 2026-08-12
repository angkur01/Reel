import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { loadDb, saveDb } from './db.js';

// In-memory active sessions mapping token -> timestamp
const activeSessions = new Map<string, number>();

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
  const token = crypto.randomBytes(32).toString('hex');
  const db = loadDb();
  if (!db.auth.sessions) {
    db.auth.sessions = {};
  }
  db.auth.sessions[token] = Date.now();
  saveDb(db);
  return token;
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const db = loadDb();
  const sessions = db.auth.sessions || {};
  const lastActiveAt = sessions[token];
  if (!lastActiveAt) return false;

  // Session valid for 365 days
  const MAX_AGE = 365 * 24 * 60 * 60 * 1000;
  if (Date.now() - lastActiveAt > MAX_AGE) {
    delete db.auth.sessions![token];
    saveDb(db);
    return false;
  }

  // Auto-renew session activity timestamp if last active > 1 hour ago
  if (Date.now() - lastActiveAt > 60 * 60 * 1000) {
    db.auth.sessions![token] = Date.now();
    saveDb(db);
  }

  return true;
}

export function revokeSession(token: string): void {
  const db = loadDb();
  if (db.auth.sessions && db.auth.sessions[token]) {
    delete db.auth.sessions[token];
    saveDb(db);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined = undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.admin_session) {
    token = req.cookies.admin_session;
  }

  if (isValidSession(token)) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized. Admin login required.' });
  }
}
