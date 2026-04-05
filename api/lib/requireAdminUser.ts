import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { User } from '@prisma/client';
import { getSessionUser } from './auth.js';

export async function requireAdminUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<User | null> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return user;
}
