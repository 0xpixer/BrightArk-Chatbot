import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from './prisma.js';

export const SESSION_COOKIE = 'brightark_admin_session';
const SESSION_DAYS = 14;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function readSessionToken(req: VercelRequest): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';').map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(`${SESSION_COOKIE}=`)) {
      return decodeURIComponent(p.slice(SESSION_COOKIE.length + 1));
    }
  }
  return null;
}

export function setSessionCookie(res: VercelResponse, token: string): void {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: VercelResponse): void {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export async function getSessionUser(req: VercelRequest) {
  const token = readSessionToken(req);
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function createSession(userId: string): Promise<string> {
  const token = newSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  await prisma.session.create({
    data: { token, userId, expiresAt },
  });
  return token;
}

export async function destroySession(req: VercelRequest): Promise<void> {
  const token = readSessionToken(req);
  if (!token) return;
  await prisma.session.deleteMany({ where: { token } });
}

const GOOGLE_STATE_COOKIE = 'brightark_google_oauth_state';

export function setGoogleOAuthState(res: VercelResponse, state: string): void {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const parts = [
    `${GOOGLE_STATE_COOKIE}=${encodeURIComponent(state)}`,
    'Path=/',
    'Max-Age=600',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function readGoogleOAuthState(req: VercelRequest): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';').map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(`${GOOGLE_STATE_COOKIE}=`)) {
      return decodeURIComponent(p.slice(GOOGLE_STATE_COOKIE.length + 1));
    }
  }
  return null;
}

export function clearGoogleOAuthState(res: VercelResponse): void {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const parts = [
    `${GOOGLE_STATE_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/** Clear Google OAuth state cookie and set admin session (two Set-Cookie headers). */
export function setSessionAfterGoogleOAuth(res: VercelResponse, sessionToken: string): void {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const sessionLine = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) sessionLine.push('Secure');
  const clearGoogleLine = [
    `${GOOGLE_STATE_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) clearGoogleLine.push('Secure');
  res.setHeader('Set-Cookie', [clearGoogleLine.join('; '), sessionLine.join('; ')]);
}
