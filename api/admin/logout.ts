import type { VercelRequest, VercelResponse } from '@vercel/node';
import { destroySession, clearSessionCookie } from '../lib/auth.js';
import { isDatabaseConfigured } from '../lib/prisma.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (isDatabaseConfigured()) {
    await destroySession(req);
  }
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
