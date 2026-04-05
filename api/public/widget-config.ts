import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleWidgetConfig } from '../../lib/server/publicRoutes.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await handleWidgetConfig(req, res);
}
