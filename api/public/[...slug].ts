import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatchPublic } from '../../lib/server/publicRoutes.js';

function normalizeSlug(raw: string | string[] | undefined): string {
  if (raw == null) return '';
  return Array.isArray(raw) ? raw.join('/') : raw;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const route = normalizeSlug(req.query.slug as string | string[] | undefined);
  await dispatchPublic(req, res, route);
}
