import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { ensureStorage } from './lib/storage';
import { startQueue, stopQueue } from './clipper/queue';
import { scheduleRetention } from './clipper/retention';
import { checkTools } from './lib/tools';
import { detectEncoder } from './clipper/encoder';
import { startPublisher, stopPublisher } from './social/publisher';
import { startAutopilot, stopAutopilot } from './autopilot/runner';
import { captionsAvailable } from './clipper/transcribe';
import { aiAvailable } from './ai/copy';
import { PLATFORMS, providers } from './social/providers';

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

  // The encoder is tried before the first job starts, so a missing graphics card never fails a render
  void detectEncoder()
    .then((e) => {
      console.log(`   ✔ encoder ${e.active}${e.hardware ? ' (hardware)' : ''} · ${e.parallel} clip(s) at a time`);
      if (e.note) console.warn(`   ⚠ ${e.note}`);
      if (!e.drawsText) console.warn('   ⚠ this ffmpeg has no libass: captions, hook titles and credits cannot be drawn');
    })
    .finally(() => startQueue());
  startPublisher();
  startAutopilot();
  console.log(`   ${captionsAvailable() ? '✔ captions on' : '· captions off (set WHISPER_URL)'} · ${aiAvailable() ? '✔ AI titles on' : 'AI titles off (set ANTHROPIC_API_KEY)'}`);
  scheduleRetention();
  const social = PLATFORMS.filter((p) => providers[p].configured());
  console.log(social.length ? `   ✔ posting to: ${social.map((p) => providers[p].label).join(', ')}` : '   · no social platforms set up yet (docs/SOCIAL.md)');
  if (social.length && !env.PUBLIC_URL) console.warn('   ⚠ PUBLIC_URL is not set: the platforms need the exact address of this server to send people back after they approve.');

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down…`);
    server.close();
    await stopQueue();
    await stopPublisher();
    stopAutopilot();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
