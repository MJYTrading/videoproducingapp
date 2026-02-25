import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from './db.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({ data: { userId, token, expiresAt } });
  return token;
}

export async function validateSession(token: string): Promise<string | null> {
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }
  await prisma.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() + SESSION_DURATION_MS) },
  });
  return session.userId;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/api/auth/login' || req.path === '/api/auth/register' || req.path === '/api/auth/check') {
    return next();
  }
  if (!req.path.startsWith('/api/')) {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }
  const token = authHeader.slice(7);
  const userId = await validateSession(token);
  if (!userId) {
    return res.status(401).json({ error: 'Sessie verlopen, log opnieuw in' });
  }
  (req as any).userId = userId;
  next();
}
