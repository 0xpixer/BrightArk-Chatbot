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

  const rows = await prisma.chatConversation.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, role: true },
      },
    },
  });

  res.status(200).json({
    conversations: rows.map((c) => ({
      id: c.id,
      updatedAt: c.updatedAt.toISOString(),
      lastMessage: c.messages[0]?.content?.slice(0, 200) ?? '',
      lastRole: c.messages[0]?.role ?? null,
    })),
  });
}
