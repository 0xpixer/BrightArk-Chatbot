import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma, isDatabaseConfigured } from '../lib/prisma.js';
import { hashPassword, createSession, setSessionCookie } from '../lib/auth.js';

type Body = { email?: string; password?: string; username?: string };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: Body;
  try {
    body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as Body)
        : ((req.body ?? {}) as Body);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const count = await prisma.user.count();
  if (count > 0) {
    res.status(403).json({ error: 'Registration is closed. Sign in instead.' });
    return;
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const username = typeof body.username === 'string' ? body.username.trim() : undefined;

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Valid email required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, username: username || null },
  });

  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.status(201).json({
    user: { id: user.id, email: user.email, username: user.username },
  });
}
