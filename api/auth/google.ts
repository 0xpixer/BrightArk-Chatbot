import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGoogleStart } from '../../lib/server/authRoutes.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await handleGoogleStart(req, res);
}
