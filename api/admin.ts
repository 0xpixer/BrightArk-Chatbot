import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatchAdmin } from '../lib/server/adminRoutes.js';

const ALLOWED = new Set([
  'status',
  'login',
  'register',
  'logout',
  'me',
  'settings',
  'conversations',
  'conversation-detail',
]);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const raw = req.query.op;
  const op = Array.isArray(raw) ? raw[0] : raw;
  const key = typeof op === 'string' ? op.trim() : '';
  if (!ALLOWED.has(key)) {
    res.status(400).json({ error: 'Missing or invalid op query parameter' });
    return;
  }
  await dispatchAdmin(req, res, key);
}
