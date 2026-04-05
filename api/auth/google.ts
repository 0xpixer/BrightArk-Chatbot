import type { VercelRequest, VercelResponse } from '@vercel/node';
import { newSessionToken, setGoogleOAuthState } from '../lib/auth.js';
import { publicBaseUrl } from '../lib/publicBaseUrl.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    res.status(503).send('GOOGLE_CLIENT_ID is not configured');
    return;
  }
  const state = newSessionToken();
  setGoogleOAuthState(res, state);
  const redirectUri = `${publicBaseUrl(req)}/api/auth/google-callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  res.status(302).setHeader('Location', url.toString()).end();
}
