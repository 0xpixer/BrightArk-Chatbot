import { PrismaClient } from '@prisma/client';

/**
 * Vercel Postgres / Neon integrations often inject POSTGRES_PRISMA_URL or POSTGRES_URL.
 * Prisma's schema expects DATABASE_URL — mirror the first available value at runtime.
 */
function resolveDatabaseUrl(): string | undefined {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.NEON_DATABASE_URL,
  ];
  for (const c of candidates) {
    const t = typeof c === 'string' ? c.trim() : '';
    if (t) return t;
  }
  return undefined;
}

const resolvedUrl = resolveDatabaseUrl();
if (resolvedUrl && !process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = resolvedUrl;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
