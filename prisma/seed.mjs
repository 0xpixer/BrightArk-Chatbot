/**
 * One-time first admin: set env then run `npx prisma db seed`
 *
 *   DATABASE_URL=postgresql://...
 *   SEED_ADMIN_EMAIL=you@company.com
 *   SEED_ADMIN_PASSWORD=at-least-8-chars
 *   SEED_ADMIN_USERNAME=Admin   (optional)
 *
 * Skips if any user already exists or vars are missing.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const username = process.env.SEED_ADMIN_USERNAME?.trim() || null;

  if (!email || !email.includes('@')) {
    console.log(
      '[seed] Skipped: set SEED_ADMIN_EMAIL (and SEED_ADMIN_PASSWORD, min 8 chars) to create the first admin.',
    );
    return;
  }
  if (!password || password.length < 8) {
    console.log('[seed] Skipped: SEED_ADMIN_PASSWORD must be at least 8 characters.');
    return;
  }

  const count = await prisma.user.count();
  if (count > 0) {
    console.log('[seed] Skipped: database already has', count, 'user(s). Use login or register is closed.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      username,
    },
  });
  console.log('[seed] Created first admin:', email);
}

main()
  .catch((e) => {
    console.error('[seed]', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
