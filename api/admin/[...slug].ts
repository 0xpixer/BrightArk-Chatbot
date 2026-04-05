import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatchAdmin } from '../../lib/server/adminRoutes.js';

function normalizeSlug(raw: string | string[] | undefined): string {
  if (raw == null) return '';
  return Array.isArray(raw) ? raw.join('/') : raw;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const route = normalizeSlug(req.query.slug as string | string[] | undefined);
  await dispatchAdmin(req, res, route);
}
