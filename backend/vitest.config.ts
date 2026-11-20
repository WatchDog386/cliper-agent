import { defineConfig } from 'vitest/config';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://cliper:cliper@localhost:5432/cliper_test?schema=public';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    include: ['test/**/*.test.ts'],
    // One shared database: run files one after another.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      LOGIN_RATE_LIMIT: '1000',
      API_RATE_LIMIT: '100000',
      STORAGE_DIR: 'storage-test',
      ALLOW_SIGNUP: 'true',
      // Never call the real OpusClip API from tests (a developer's .env may hold a key)
      OPUSCLIP_API_KEY: '',
    },
  },
});
