import type { Platform, SocialAccount } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { open, seal } from '../lib/secret-box';
import { ProviderError } from './http';
import { providers } from './providers';
import type { ConnectedAccount, TokenSet } from './types';

/** Save (or update) the accounts a sign-in returned. Tokens are encrypted before they are stored. */
export async function saveAccounts(userId: string, platform: Platform, found: ConnectedAccount[]) {
  const saved: SocialAccount[] = [];
  for (const a of found) {
    const data = {
      name: a.name,
      handle: a.handle ?? null,
      avatarUrl: a.avatarUrl ?? null,
      accessToken: seal(a.accessToken),
      refreshToken: a.refreshToken ? seal(a.refreshToken) : null,
      expiresAt: a.expiresAt ?? null,
      scopes: a.scopes ?? null,
      needsReconnect: false,
    };
    saved.push(
      await prisma.socialAccount.upsert({
        where: { userId_platform_externalId: { userId, platform, externalId: a.externalId } },
        create: { userId, platform, externalId: a.externalId, ...data },
        update: data,
      }),
    );
  }
  return saved;
}

const readTokens = (a: SocialAccount): TokenSet => ({
  accessToken: open(a.accessToken),
  refreshToken: a.refreshToken ? open(a.refreshToken) : null,
  expiresAt: a.expiresAt,
  scopes: a.scopes,
});

/** Renew this long before the token runs out. Instagram's 60-day tokens are renewed a week ahead. */
const AHEAD_MS: Partial<Record<Platform, number>> = { INSTAGRAM: 7 * 86_400_000 };

// Two posts to one account must not renew its token at the same moment (X's refresh tokens are single-use)
const renewing = new Map<string, Promise<TokenSet>>();

/**
 * Working tokens for an account: renewed first when they are about to expire. When the platform refuses,
 * the account is flagged so the app can ask the person to connect it again.
 */
export async function freshTokens(account: SocialAccount): Promise<TokenSet> {
  const provider = providers[account.platform];
  let current: TokenSet;
  try {
    current = readTokens(account);
  } catch {
    await flagReconnect(account.id);
    throw new ProviderError(`The saved sign-in for ${account.name} can no longer be read. Connect it again.`, 401, true);
  }
  const ahead = AHEAD_MS[account.platform] ?? 5 * 60_000;
  if (!current.expiresAt || current.expiresAt.getTime() - Date.now() > ahead) return current;
  if (!provider.refresh) {
    if (current.expiresAt.getTime() > Date.now()) return current;
    await flagReconnect(account.id);
    throw new ProviderError(`${provider.label} access for ${account.name} has expired. Connect it again.`, 401, true);
  }
  const pending = renewing.get(account.id);
  if (pending) return pending;
  const job = (async () => {
    try {
      const next = await provider.refresh!(current);
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: seal(next.accessToken),
          refreshToken: next.refreshToken ? seal(next.refreshToken) : null,
          expiresAt: next.expiresAt ?? null,
          scopes: next.scopes ?? account.scopes,
          needsReconnect: false,
        },
      });
      return next;
    } catch (e) {
      // Still valid for now (e.g. Instagram a week ahead): carry on with what we have
      if (!(e instanceof ProviderError && e.authFailed) && current.expiresAt && current.expiresAt.getTime() > Date.now() + 60_000) return current;
      if (e instanceof ProviderError && e.authFailed) await flagReconnect(account.id);
      throw e;
    } finally {
      renewing.delete(account.id);
    }
  })();
  renewing.set(account.id, job);
  return job;
}

export const flagReconnect = (id: string) => prisma.socialAccount.updateMany({ where: { id }, data: { needsReconnect: true } }).then(() => undefined);

/** An account as the app sees it (never the tokens). */
export const accountView = (a: SocialAccount) => ({
  id: a.id,
  platform: a.platform,
  name: a.name,
  handle: a.handle,
  avatarUrl: a.avatarUrl,
  needsReconnect: a.needsReconnect,
  connectedAt: a.createdAt,
});
