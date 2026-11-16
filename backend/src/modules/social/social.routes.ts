import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { PublicationStatus } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/http-error';
import { open, seal } from '../../lib/secret-box';
import { ah } from '../../middleware/async';
import { me, requireAuth } from '../../middleware/auth';
import { parse } from '../../middleware/validate';
import { accountView, saveAccounts } from '../../social/accounts';
import { ProviderError } from '../../social/http';
import { PLATFORMS, providerFor, providers } from '../../social/providers';
import { abortPublication } from '../../social/publisher';

/*
 * Connecting social accounts (OAuth 2):
 *   1. the app asks POST /social/connect/:platform and opens the address it gets back
 *   2. the person approves on the platform, which sends them to GET /social/callback/:platform
 *   3. the server trades the code for tokens, stores them encrypted, and sends the person back to the app
 */
export const socialRouter = Router();

const STATE_MINUTES = 15;

/** Where this server is reachable from the internet (what the platforms redirect back to). */
function baseUrl(req: Request) {
  return env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}
const redirectUri = (req: Request, slug: string) => `${baseUrl(req)}/api/v1/social/callback/${slug}`;

/** The app may only ask to be sent back to itself: this site, the phone app, or (in development) localhost. */
function safeReturn(req: Request, wanted: string | undefined) {
  const home = `${baseUrl(req)}/channels`;
  if (!wanted) return home;
  if (wanted.startsWith('cliperagent://')) return wanted;
  try {
    const u = new URL(wanted);
    const allowed = [new URL(baseUrl(req)).origin, ...(env.CORS_ORIGIN === '*' ? [] : env.CORS_ORIGIN.split(',').map((o) => o.trim()))];
    if (allowed.includes(u.origin)) return wanted;
    if (env.NODE_ENV !== 'production' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && /^https?:$/.test(u.protocol)) return wanted;
  } catch {
    /* not a URL */
  }
  return home;
}

/**
 * The outcome travels in the address's fragment (#connected=…): browsers keep it across the redirect,
 * it never reaches a server or its logs, and static hosts do not trip over the text in it.
 */
function withResult(returnTo: string, params: Record<string, string>) {
  return `${returnTo.split('#')[0]}#${new URLSearchParams(params)}`;
}

/** Which platforms exist, which are set up on this server, and the address to register with each. */
socialRouter.get('/providers', requireAuth, (req, res) => {
  res.json({
    providers: PLATFORMS.map((key) => {
      const p = providers[key];
      return {
        platform: key,
        label: p.label,
        noun: p.noun,
        configured: p.configured(),
        envNames: p.envNames,
        privacy: p.privacy,
        limits: p.limits,
        redirectUri: redirectUri(req, key.toLowerCase()),
      };
    }),
  });
});

socialRouter.get(
  '/accounts',
  requireAuth,
  ah(async (req, res) => {
    const accounts = await prisma.socialAccount.findMany({ where: { userId: me(req).id }, orderBy: [{ platform: 'asc' }, { createdAt: 'asc' }] });
    res.json({ accounts: accounts.map(accountView) });
  }),
);

socialRouter.post(
  '/connect/:platform',
  requireAuth,
  ah(async (req, res) => {
    const provider = providerFor(String(req.params.platform));
    if (!provider) throw notFound('Platform');
    if (!provider.configured()) throw badRequest(`${provider.label} is not set up on this server yet. Add ${provider.envNames.join(' and ')} to the server settings (see docs/SOCIAL.md).`, 'NOT_CONFIGURED');
    const { returnTo } = parse(z.object({ returnTo: z.string().max(500).optional() }), req.body ?? {});
    const state = crypto.randomBytes(24).toString('base64url');
    const verifier = provider.pkce ? crypto.randomBytes(48).toString('base64url') : null;
    await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.oAuthState.create({
      data: {
        id: state,
        userId: me(req).id,
        platform: provider.platform,
        verifier: verifier ? seal(verifier) : null,
        returnTo: safeReturn(req, returnTo),
        expiresAt: new Date(Date.now() + STATE_MINUTES * 60_000),
      },
    });
    const challenge = verifier ? crypto.createHash('sha256').update(verifier).digest('base64url') : undefined;
    res.json({ url: provider.authorizeUrl({ state, redirectUri: redirectUri(req, provider.platform.toLowerCase()), challenge }) });
  }),
);

/** Where the platform sends the person after they approve (or refuse). Not behind sign-in: the `state` proves who it is. */
socialRouter.get(
  '/callback/:platform',
  ah(async (req, res) => {
    const provider = providerFor(String(req.params.platform));
    const stateId = typeof req.query.state === 'string' ? req.query.state : '';
    // Single use: taken out of the table whatever happens next
    const state = stateId ? await prisma.oAuthState.findUnique({ where: { id: stateId } }) : null;
    if (state) await prisma.oAuthState.delete({ where: { id: state.id } }).catch(() => undefined);
    if (!provider || !state || state.platform !== provider.platform || state.expiresAt < new Date()) {
      return void res.redirect(withResult(`${baseUrl(req)}/channels`, { error: 'That sign-in took too long or was already used. Try connecting again.' }));
    }
    const fail = (message: string) => res.redirect(withResult(state.returnTo, { error: message, platform: provider.platform }));
    if (typeof req.query.error === 'string' || typeof req.query.code !== 'string') {
      const why = String(req.query.error_description ?? req.query.error ?? 'No approval was given');
      return void fail(/denied|cancel/i.test(why) ? `You did not approve the ${provider.label} connection.` : why.slice(0, 200));
    }
    try {
      const found = await provider.exchange({
        code: req.query.code,
        redirectUri: redirectUri(req, provider.platform.toLowerCase()),
        verifier: state.verifier ? open(state.verifier) : undefined,
      });
      const saved = await saveAccounts(state.userId, provider.platform, found);
      res.redirect(withResult(state.returnTo, { connected: provider.platform, name: saved.map((a) => a.name).join(', ').slice(0, 120) }));
    } catch (e) {
      if (!(e instanceof ProviderError)) console.error(`[social] ${provider.platform} callback failed`, e);
      fail(e instanceof ProviderError ? e.message : `Could not finish connecting ${provider.label}. Try again.`);
    }
  }),
);

/** Disconnect: forgets the tokens, cancels posts still waiting, keeps nothing on the platform's side. */
socialRouter.delete(
  '/accounts/:id',
  requireAuth,
  ah(async (req, res) => {
    const account = await prisma.socialAccount.findFirst({ where: { id: String(req.params.id), userId: me(req).id } });
    if (!account) throw notFound('Account');
    const active = await prisma.publication.findMany({ where: { accountId: account.id, status: PublicationStatus.PUBLISHING }, select: { id: true } });
    for (const p of active) abortPublication(p.id);
    await prisma.socialAccount.delete({ where: { id: account.id } });
    res.status(204).end();
  }),
);
