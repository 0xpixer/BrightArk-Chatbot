/**
 * Public CORS endpoints — /api/public/* (Vercel Hobby).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPublicWidgetConfig } from './siteSettings.js';

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export async function dispatchPublic(
  req: VercelRequest,
  res: VercelResponse,
  route: string,
): Promise<void> {
  if (route === 'widget-config') {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const cfg = await getPublicWidgetConfig();
    res.status(200).json(cfg);
    return;
  }
  res.status(404).json({ error: 'Not found' });
}
