import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma, isDatabaseConfigured } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { requireAdminUser } from '../lib/requireAdminUser.js';

type PatchBody = {
  username?: string;
  password?: string;
  currentPassword?: string;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }

  const user = await requireAdminUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    res.status(200).json({
      user: { id: user.id, email: user.email, username: user.username },
    });
    return;
  }

  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: PatchBody;
  try {
    body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as PatchBody)
        : ((req.body ?? {}) as PatchBody);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const data: { username?: string | null; passwordHash?: string } = {};

  if (body.username !== undefined) {
    const u = typeof body.username === 'string' ? body.username.trim() : '';
    data.username = u || null;
  }

  if (body.password !== undefined && body.password !== '') {
    const newPass = body.password;
    if (newPass.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (!user.passwordHash) {
      data.passwordHash = await hashPassword(newPass);
    } else {
      const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const ok = await verifyPassword(current, user.passwordHash);
      if (!ok) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }
      data.passwordHash = await hashPassword(newPass);
    }
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'No changes' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
  });

  res.status(200).json({
    user: { id: updated.id, email: updated.email, username: updated.username },
  });
}
