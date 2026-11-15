import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { ensureStorage } from './lib/storage';
import { startQueue, stopQueue } from './clipper/queue';
import { scheduleRetention } from './clipper/retention';
import { checkTools } from './lib/tools';

export function startServer() {
  ensureStorage();
  const server = createApp().listen(env.PORT, () => {
    console.log(`🎬 ${env.APP_NAME} API listening on http://localhost:${env.PORT}/api/v1`);
    void checkTools().then((t) => {
      for (const [name, info] of Object.entries(t)) {
        if (info.ok) console.log(`   ✔ ${name} ${info.version} (${info.path})`);
        else console.warn(`   ✖ ${name} not found (${info.path}). Run \`npm run tools\` or set ${name.toUpperCase().replace('-', '')}_PATH.`);
      }
    });
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  // Big uploads: no request timeout
  server.requestTimeout = 0;

  startQueue();
  scheduleRetention();

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down…`);
    server.close();
    await stopQueue();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
