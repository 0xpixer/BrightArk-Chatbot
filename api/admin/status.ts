import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma, isDatabaseConfigured } from '../lib/prisma.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!isDatabaseConfigured()) {
    res.status(200).json({ database: false, hasUsers: false });
    return;
  }
  const count = await prisma.user.count();
  res.status(200).json({ database: true, hasUsers: count > 0 });
}
