import { env } from '../../config/env';
import { call, inSeconds, oneText, poll, ProviderError, readChunk } from '../http';
import type { Provider, TokenSet } from '../types';

/*
 * X / Twitter (OAuth 2 with PKCE + API v2). The video goes up through the v2 media upload
 * (initialize → append → finalize → wait for processing), then a post is created with it attached.
 */
const API = 'https://api.x.com/2';
const CHUNK = 4 * 1024 * 1024;

const basic = () => ({ Authorization: `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64')}` });

const tokens = (d: Record<string, unknown>, keep?: TokenSet): TokenSet => ({
  accessToken: String(d.access_token),
  // X hands out a new refresh token every time: always store the newest
  refreshToken: (d.refresh_token as string | undefined) ?? keep?.refreshToken ?? null,
  expiresAt: inSeconds(d.expires_in),
  scopes: (d.scope as string | undefined) ?? keep?.scopes ?? null,
});

export const x: Provider = {
  platform: 'X',
  label: 'X (Twitter)',
  noun: 'account',
  envNames: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  configured: () => Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET),
  pkce: true,
  privacy: ['public'],
  limits: { caption: 280, maxSeconds: 140 },

  authorizeUrl: ({ state, redirectUri, challenge }) =>
    `https://x.com/i/oauth2/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: env.X_CLIENT_ID,
      redirect_uri: redirectUri,
      // offline.access: a refresh token, so posting keeps working after the two-hour access token
      scope: 'tweet.read tweet.write users.read media.write offline.access',
      state,
      code_challenge: challenge ?? '',
      code_challenge_method: 'S256',
    })}`,

  async exchange({ code, redirectUri, verifier }) {
    const { data } = await call(`${API}/oauth2/token`, {
      headers: basic(),
      form: { code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: verifier ?? '', client_id: env.X_CLIENT_ID },
    });
    const t = tokens(data);
    const me = await call(`${API}/users/me?user.fields=profile_image_url`, { token: t.accessToken });
    const u = (me.data.data ?? {}) as { id?: string; name?: string; username?: string; profile_image_url?: string };
    if (!u.id) throw new ProviderError('X did not say which account signed in', 502);
    return [{ ...t, externalId: u.id, name: u.name ?? u.username ?? 'X account', handle: u.username ?? null, avatarUrl: u.profile_image_url ?? null }];
  },

  async refresh(current) {
    if (!current.refreshToken) throw new ProviderError('Connect the X account again.', 401, true);
    const { data } = await call(`${API}/oauth2/token`, {
      headers: basic(),
      form: { refresh_token: current.refreshToken, grant_type: 'refresh_token', client_id: env.X_CLIENT_ID },
    }).catch((e: unknown) => {
      if (e instanceof ProviderError && (e.status === 400 || e.status === 401)) throw new ProviderError('X access has expired. Connect the account again.', 401, true);
      throw e;
    });
    return tokens(data, current);
  },

  async publish(p) {
    const token = p.tokens.accessToken;
    const init = await call(`${API}/media/upload/initialize`, { token, json: { media_type: 'video/mp4', total_bytes: p.size, media_category: 'tweet_video' }, signal: p.signal });
    const mediaId = String(init.data.data?.id ?? '');
    if (!mediaId) throw new ProviderError('X did not open an upload', 502, false, true);

    for (let sent = 0, i = 0; sent < p.size; i++) {
      const chunk = await readChunk(p.file, sent, Math.min(CHUNK, p.size - sent));
      const form = new FormData();
      form.set('segment_index', String(i));
      form.set('media', new Blob([new Uint8Array(chunk)], { type: 'application/octet-stream' }), 'chunk.mp4');
      await call(`${API}/media/upload/${mediaId}/append`, { token, body: form, signal: p.signal });
      sent += chunk.length;
      p.onProgress((sent / p.size) * 0.9);
    }

    const fin = await call(`${API}/media/upload/${mediaId}/finalize`, { token, method: 'POST', signal: p.signal });
    let info = fin.data.data?.processing_info as { state?: string; check_after_secs?: number; error?: { message?: string } } | undefined;
    // No processing_info: the video is ready at once
    if (info && info.state !== 'succeeded') {
      await poll(
        async () => {
          if (info?.state === 'failed') throw new ProviderError(`X could not process the video: ${info.error?.message ?? 'unsupported video'}`, 400);
          const s = await call(`${API}/media/upload?${new URLSearchParams({ media_id: mediaId, command: 'STATUS' })}`, { token, signal: p.signal });
          info = s.data.data?.processing_info;
          if (info?.state === 'failed') throw new ProviderError(`X could not process the video: ${info.error?.message ?? 'unsupported video'}`, 400);
          return !info || info.state === 'succeeded' ? true : undefined;
        },
        { everyMs: 4000, timeoutMs: 10 * 60_000, signal: p.signal, what: 'X processing' },
      );
    }
    const post = await call(`${API}/tweets`, { token, json: { text: oneText(p.title, p.caption, 280), media: { media_ids: [mediaId] } }, signal: p.signal });
    const id = String(post.data.data?.id ?? '');
    if (!id) throw new ProviderError('X uploaded the video but did not create the post', 502);
    p.onProgress(1);
    return { externalId: id, url: `https://x.com/${p.account.handle ?? 'i'}/status/${id}` };
  },
};
