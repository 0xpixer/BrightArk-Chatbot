import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPublicWidgetConfig } from '../lib/siteSettings.js';

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
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
}
