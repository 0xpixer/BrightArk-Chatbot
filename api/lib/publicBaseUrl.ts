import type { VercelRequest } from '@vercel/node';

/** Canonical site URL for OAuth redirects (set ADMIN_PUBLIC_URL in production). */
export function publicBaseUrl(req: VercelRequest): string {
  const env = process.env.ADMIN_PUBLIC_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  const host = (req.headers['x-forwarded-host'] || req.headers.host) as string;
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  return `${proto}://${host}`;
}
