import fs from 'node:fs';
import { env } from '../../config/env';
import { call, clip, inSeconds, oneText, poll, ProviderError } from '../http';
import type { Provider, TokenSet } from '../types';

/*
 * Instagram (Instagram API with Instagram Login). Works for professional accounts: Business or
 * Creator. Clips are published as Reels. Instagram fetches the video from a link when the server has a
 * public address (PUBLIC_URL); otherwise the file is uploaded to Instagram directly.
 */
const V = 'v22.0';
const GRAPH = `https://graph.instagram.com/${V}`;

export const instagram: Provider = {
  platform: 'INSTAGRAM',
  label: 'Instagram',
  noun: 'account',
  envNames: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  configured: () => Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET),
  pkce: false,
  privacy: ['public'],
  limits: { caption: 2200, maxSeconds: 15 * 60 },

  authorizeUrl: ({ state, redirectUri }) =>
    `https://www.instagram.com/oauth/authorize?${new URLSearchParams({
      client_id: env.INSTAGRAM_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_content_publish',
      state,
    })}`,

  async exchange({ code, redirectUri }) {
    const first = await call('https://api.instagram.com/oauth/access_token', {
      form: { client_id: env.INSTAGRAM_APP_ID, client_secret: env.INSTAGRAM_APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri, code: code.replace(/#_$/, '') },
    });
    // The reply is either the object itself or wrapped in { data: [ … ] }
    const short = ((first.data.data as Record<string, unknown>[] | undefined)?.[0] ?? first.data) as { access_token?: string };
    if (!short.access_token) throw new ProviderError('Instagram did not return a sign-in', 502);
    // Trade the one-hour token for the 60-day one
    const long = await call(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: env.INSTAGRAM_APP_SECRET, access_token: short.access_token })}`);
    const t: TokenSet = { accessToken: String(long.data.access_token), refreshToken: null, expiresAt: inSeconds(long.data.expires_in) };
    const me = await call(`${GRAPH}/me?fields=user_id,username,name,profile_picture_url`, { token: t.accessToken });
    const u = me.data as { user_id?: string | number; id?: string; username?: string; name?: string; profile_picture_url?: string };
    return [{ ...t, externalId: String(u.user_id ?? u.id), name: u.name || u.username || 'Instagram account', handle: u.username ?? null, avatarUrl: u.profile_picture_url ?? null }];
  },

  /** A 60-day token is renewed with itself (it must still be valid and at least a day old). */
  async refresh(current) {
    const { data } = await call(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: current.accessToken })}`);
    return { accessToken: String(data.access_token), refreshToken: null, expiresAt: inSeconds(data.expires_in), scopes: current.scopes };
  },

  async publish(p) {
    const id = p.account.externalId;
    const caption = oneText(p.title, p.caption, 2200);
    let container: string;
    if (p.publicVideoUrl) {
      const made = await call(`${GRAPH}/${id}/media`, { token: p.tokens.accessToken, form: { media_type: 'REELS', video_url: p.publicVideoUrl, caption, share_to_feed: 'true' }, signal: p.signal });
      container = String(made.data.id);
    } else {
      const made = await call(`${GRAPH}/${id}/media`, { token: p.tokens.accessToken, form: { media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: 'true' }, signal: p.signal });
      container = String(made.data.id);
      const uri = (made.data.uri as string | undefined) ?? `https://rupload.facebook.com/ig-api-upload/${V}/${container}`;
      await call(uri, {
        headers: { Authorization: `OAuth ${p.tokens.accessToken}`, offset: '0', file_size: String(p.size), 'Content-Type': 'application/octet-stream' },
        body: await fs.promises.readFile(p.file),
        signal: p.signal,
      });
    }
    p.onProgress(0.6);

    await poll(
      async () => {
        const s = await call(`${GRAPH}/${container}?fields=status_code,status`, { token: p.tokens.accessToken, signal: p.signal });
        const code = s.data.status_code as string | undefined;
        if (code === 'ERROR' || code === 'EXPIRED') throw new ProviderError(`Instagram could not process the video: ${clip(String(s.data.status ?? code), 200)}`, 400);
        return code === 'FINISHED' || code === 'PUBLISHED' ? true : undefined;
      },
      { everyMs: 5000, timeoutMs: 10 * 60_000, signal: p.signal, what: 'Instagram processing' },
    );
    p.onProgress(0.9);
    const done = await call(`${GRAPH}/${id}/media_publish`, { token: p.tokens.accessToken, form: { creation_id: container }, signal: p.signal });
    const mediaId = String(done.data.id);
    const link = await call(`${GRAPH}/${mediaId}?fields=permalink`, { token: p.tokens.accessToken, signal: p.signal }).catch(() => null);
    return { externalId: mediaId, url: (link?.data.permalink as string | undefined) ?? null };
  },
};
