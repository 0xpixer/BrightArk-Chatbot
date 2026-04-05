import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma, isDatabaseConfigured } from '../lib/prisma.js';
import {
  verifyPassword,
  createSession,
  setSessionCookie,
} from '../lib/auth.js';

type Body = { email?: string; password?: string };

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

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.status(200).json({
    user: { id: user.id, email: user.email, username: user.username },
  });
}
