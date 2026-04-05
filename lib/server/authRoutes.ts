/**
 * Google OAuth — single dispatcher for /api/auth/* (Vercel Hobby).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma, isDatabaseConfigured } from './prisma.js';
import {
  newSessionToken,
  setGoogleOAuthState,
  createSession,
  readGoogleOAuthState,
  setSessionAfterGoogleOAuth,
} from './auth.js';
import { publicBaseUrl } from './publicBaseUrl.js';

export async function handleGoogleStart(req: VercelRequest, res: VercelResponse): Promise<void> {
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

async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured');
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ access_token: string }>;
}

async function getProfile(accessToken: string): Promise<{
  id: string;
  email: string;
  name?: string;
}> {
  const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ id: string; email: string; name?: string }>;
}

export async function handleGoogleCallback(req: VercelRequest, res: VercelResponse): Promise<void> {
  const base = publicBaseUrl(req);
  const adminHome = `${base}/admin/`;
  const redirectFail = (q: string) => {
    res.status(302).setHeader('Location', `${adminHome}#/login?${q}`).end();
  };

  if (!isDatabaseConfigured()) {
    redirectFail('error=no_database');
    return;
  }

  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const expected = readGoogleOAuthState(req);
  if (!state || !expected || state !== expected) {
    redirectFail('error=oauth_state');
    return;
  }
  if (!code) {
    redirectFail('error=oauth_denied');
    return;
  }

  const redirectUri = `${base}/api/auth/google-callback`;

  try {
    const tokens = await exchangeCode(code, redirectUri);
    const profile = await getProfile(tokens.access_token);
    if (!profile.email) throw new Error('missing email');

    const email = profile.email.trim().toLowerCase();

    let user = await prisma.user.findUnique({ where: { googleId: profile.id } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.id,
          email,
          username: profile.name?.trim() || user.username,
        },
      });
    } else {
      const count = await prisma.user.count();
      if (count > 0) {
        redirectFail('error=google_not_linked');
        return;
      }
      user = await prisma.user.create({
        data: {
          email,
          googleId: profile.id,
          username: profile.name?.trim() || null,
          passwordHash: null,
        },
      });
    }

    const sessionToken = await createSession(user.id);
    setSessionAfterGoogleOAuth(res, sessionToken);
    res.status(302).setHeader('Location', `${adminHome}`).end();
  } catch (e) {
    console.error('google-callback', e);
    redirectFail('error=oauth_failed');
  }
}
