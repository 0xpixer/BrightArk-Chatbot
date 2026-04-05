import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma, isDatabaseConfigured } from '../lib/prisma.js';
import { requireAdminUser } from '../lib/requireAdminUser.js';

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

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }

  const conv = await prisma.chatConversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!conv) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.status(200).json({
    conversation: {
      id: conv.id,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    },
  });
}
