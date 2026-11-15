import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { verifyToken } from './lib/jwt';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { checkTools } from './lib/tools';
import { requireAuth } from './middleware/auth';
import { ah } from './middleware/async';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './modules/auth/auth.routes';
import { jobsRouter } from './modules/jobs/jobs.routes';
import { mediaRouter } from './modules/media/media.routes';
import { sourceRouter } from './modules/source/source.routes';
import { discoverRouter } from './modules/discover/discover.routes';
import { queueStats } from './clipper/queue';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind Caddy: trust the proxy so rate limiting and logs see the real client IP
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);
  // Clips and thumbnails are shown by the web app, which in development runs on another port
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','), exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '1mb' }));
  if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', { skip: (req) => req.path.startsWith('/api/v1/media/') }));

  // Healthy only while the database answers, so the proxy and monitors notice an outage
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', service: 'cliper-agent-api', time: new Date() });
    } catch {
      res.status(503).json({ status: 'degraded', service: 'cliper-agent-api', database: 'unreachable', time: new Date() });
    }
  });

  const api = express.Router();
  // Media links are opened by players (many range requests per clip): they are not rate limited
  api.use('/media', mediaRouter);

  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: env.API_RATE_LIMIT,
      keyGenerator: (req) => {
        const header = req.headers.authorization;
        if (header?.startsWith('Bearer ')) {
          try {
            return `user:${verifyToken(header.slice(7)).sub}`;
          } catch {
            /* not a valid token: counted by address */
          }
        }
        return `ip:${ipKeyGenerator(req.ip ?? '')}`;
      },
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { message: 'Too many requests. Slow down and try again in a minute.', code: 'RATE_LIMITED' } },
    }),
  );
  const loginLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: env.LOGIN_RATE_LIMIT,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'Too many sign-in attempts. Try again in 15 minutes.', code: 'RATE_LIMITED' } },
  });
  api.use('/auth/login', loginLimit);
  api.use('/auth/register', loginLimit);

  /** What the app needs before sign-in. */
  api.get('/config', (_req, res) => {
    res.json({
      appName: env.APP_NAME,
      allowSignup: env.ALLOW_SIGNUP,
      limits: { maxSourceMinutes: env.MAX_SOURCE_MINUTES, maxClipsPerJob: env.MAX_CLIPS_PER_JOB, maxUploadMb: env.MAX_UPLOAD_MB },
      discover: env.YOUTUBE_API_KEY ? 'youtube-trending' : 'search',
    });
  });
  /** Tool versions and queue load (Settings → Server). */
  api.get(
    '/system',
    requireAuth,
    ah(async (_req, res) => {
      res.json({ tools: await checkTools(), queue: queueStats() });
    }),
  );

  api.use('/auth', authRouter);
  api.use('/jobs', requireAuth, jobsRouter);
  api.use('/source', requireAuth, sourceRouter);
  api.use('/discover', requireAuth, discoverRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
