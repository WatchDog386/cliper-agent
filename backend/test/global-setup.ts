import { execSync } from 'node:child_process';

/** A clean test database with every migration applied. */
export default function setup() {
  // Unit tests only (no database): SKIP_DB=1 npx vitest run test/plan.test.ts
  if (process.env.SKIP_DB === '1') return;
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://cliper:cliper@localhost:5432/cliper_test?schema=public';
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
