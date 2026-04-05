import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGoogleCallback } from '../../lib/server/authRoutes.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await handleGoogleCallback(req, res);
}
