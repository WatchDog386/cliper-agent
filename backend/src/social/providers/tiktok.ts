import { env } from '../../config/env';
import { call, inSeconds, oneText, poll, ProviderError, readChunk } from '../http';
import type { Privacy, Provider, TokenSet } from '../types';

/*
 * TikTok (Login Kit + Content Posting API, "direct post"). Until TikTok has audited the developer app,
 * it only lets the app post privately ("Only me"): choose Private until then.
 */
const API = 'https://open.tiktokapis.com/v2';
const MB = 1024 * 1024;

/**
 * How TikTok wants a file cut up: pieces of 5–64 MB, where the last one also carries the remainder
 * (so it may be bigger than the rest), and small files in one piece.
 */
export function tiktokChunks(size: number) {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 16 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

const LEVEL: Record<Privacy, string> = { public: 'PUBLIC_TO_EVERYONE', unlisted: 'MUTUAL_FOLLOW_FRIENDS', private: 'SELF_ONLY' };

/** TikTok answers 200 with an error object for some failures. */
function check(data: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const code = data.error?.code;
  if (code && code !== 'ok') {
    const text = data.error.message || code;
    if (code === 'unaudited_client_can_only_post_to_private_accounts')
      throw new ProviderError('TikTok has not audited this developer app yet, so it can only post privately. Choose "Private", or finish the app audit on developers.tiktok.com.', 400);
    throw new ProviderError(String(text), 400, code === 'access_token_invalid', code === 'rate_limit_exceeded');
  }
  if (typeof data.error === 'string') throw new ProviderError(String(data.error_description ?? data.error), 400, data.error === 'invalid_grant');
}

const tokens = (d: Record<string, unknown>): TokenSet => ({
  accessToken: String(d.access_token),
  refreshToken: (d.refresh_token as string | undefined) ?? null,
  expiresAt: inSeconds(d.expires_in),
  scopes: (d.scope as string | undefined) ?? null,
});

export const tiktok: Provider = {
  platform: 'TIKTOK',
  label: 'TikTok',
  noun: 'account',
  envNames: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  configured: () => Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
  pkce: false,
  privacy: ['public', 'unlisted', 'private'],
  limits: { caption: 2200, maxSeconds: 600 },

  authorizeUrl: ({ state, redirectUri }) =>
    `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      scope: 'user.info.basic,video.publish',
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    })}`,

  async exchange({ code, redirectUri }) {
    const { data } = await call(`${API}/oauth/token/`, {
      form: { client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirectUri },
    });
    check(data);
    const t = tokens(data);
    const me = await call(`${API}/user/info/?fields=open_id,display_name,avatar_url`, { token: t.accessToken });
    check(me.data);
    const u = (me.data.data?.user ?? {}) as { open_id?: string; display_name?: string; avatar_url?: string };
    return [{ ...t, externalId: String(u.open_id ?? data.open_id), name: u.display_name ?? 'TikTok account', handle: null, avatarUrl: u.avatar_url ?? null }];
  },

  async refresh(current) {
    if (!current.refreshToken) throw new ProviderError('Connect the TikTok account again.', 401, true);
    const { data } = await call(`${API}/oauth/token/`, {
      form: { client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: current.refreshToken },
    });
    if (typeof data.error === 'string') throw new ProviderError('TikTok access has expired. Connect the account again.', 401, true);
    return tokens(data);
  },

  async publish(p) {
    const { chunkSize, count } = tiktokChunks(p.size);
    const init = await call(`${API}/post/publish/video/init/`, {
      token: p.tokens.accessToken,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      json: {
        post_info: { title: oneText(p.title, p.caption, 2200), privacy_level: LEVEL[p.privacy], disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: { source: 'FILE_UPLOAD', video_size: p.size, chunk_size: chunkSize, total_chunk_count: count },
      },
      signal: p.signal,
      // TikTok puts the reason in the body of its 4xx answers: read it ourselves
      okStatuses: [400, 401, 403, 429],
    });
    check(init.data);
    const publishId = init.data.data?.publish_id as string | undefined;
    const uploadUrl = init.data.data?.upload_url as string | undefined;
    if (!publishId || !uploadUrl) throw new ProviderError('TikTok did not open an upload', 502, false, true);

    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const length = i === count - 1 ? p.size - start : chunkSize;
      const chunk = await readChunk(p.file, start, length);
      await call(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${start + chunk.length - 1}/${p.size}` },
        body: chunk,
        signal: p.signal,
      });
      p.onProgress((start + chunk.length) / p.size);
    }

    // TikTok processes the video, then publishes it
    const postId = await poll(
      async () => {
        const s = await call(`${API}/post/publish/status/fetch/`, { token: p.tokens.accessToken, json: { publish_id: publishId }, signal: p.signal });
        check(s.data);
        const d = s.data.data ?? {};
        if (d.status === 'FAILED') throw new ProviderError(`TikTok could not publish the video (${String(d.fail_reason ?? 'no reason given').replace(/_/g, ' ')})`, 400);
        if (d.status !== 'PUBLISH_COMPLETE') return undefined;
        const ids = (d.publicaly_available_post_id ?? d.publicly_available_post_id ?? []) as (string | number)[];
        return ids.length ? String(ids[0]) : '';
      },
      { everyMs: 5000, timeoutMs: 10 * 60_000, signal: p.signal, what: 'TikTok processing' },
    );
    // Private posts have no public id (and so no link)
    return { externalId: postId || publishId, url: postId && p.account.handle ? `https://www.tiktok.com/@${p.account.handle}/video/${postId}` : null };
  },
};

