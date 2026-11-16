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
      // Never inherit a developer's local .env here: the tests check that private links are refused
      ALLOW_PRIVATE_URLS: 'false',
      // Two platforms are "set up" for the tests; the rest stay unconfigured
      PUBLIC_URL: 'https://clips.test',
      YOUTUBE_CLIENT_ID: 'yt-id',
      YOUTUBE_CLIENT_SECRET: 'yt-secret',
      X_CLIENT_ID: 'x-id',
      X_CLIENT_SECRET: 'x-secret',
    },
  },
});
