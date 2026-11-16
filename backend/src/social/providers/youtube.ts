import { env } from '../../config/env';
import { call, clip, inSeconds, ProviderError, readChunk } from '../http';
import type { Provider, TokenSet } from '../types';

/*
 * YouTube (Google OAuth 2 + YouTube Data API v3). Vertical clips up to three minutes are published as
 * Shorts by YouTube itself. Uploads are resumable and go up 8 MB at a time.
 */
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const CHUNK = 8 * 1024 * 1024; // must be a multiple of 256 KB

const tokens = (d: Record<string, unknown>, keep?: TokenSet): TokenSet => ({
  accessToken: String(d.access_token),
  // Google only sends the refresh token the first time: keep the one we have
  refreshToken: (d.refresh_token as string | undefined) ?? keep?.refreshToken ?? null,
  expiresAt: inSeconds(d.expires_in),
  scopes: (d.scope as string | undefined) ?? keep?.scopes ?? null,
});

export const youtube: Provider = {
  platform: 'YOUTUBE',
  label: 'YouTube',
  noun: 'channel',
  envNames: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  configured: () => Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET),
  pkce: false,
  privacy: ['public', 'unlisted', 'private'],
  limits: { title: 100, caption: 5000, maxSeconds: 12 * 3600 },

  authorizeUrl: ({ state, redirectUri }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      // offline + consent: Google then returns a refresh token, so posting keeps working for months
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    })}`,

  async exchange({ code, redirectUri }) {
    const { data } = await call(TOKEN, {
      form: { code, client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    });
    const t = tokens(data);
    const me = await call(`${API}/channels?part=snippet&mine=true`, { token: t.accessToken });
    const channels = (me.data.items ?? []) as { id: string; snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }[];
    if (!channels.length) throw new ProviderError('This Google account has no YouTube channel yet. Create one on youtube.com, then connect again.', 400);
    return channels.map((c) => ({
      ...t,
      externalId: c.id,
      name: c.snippet?.title ?? 'YouTube channel',
      handle: c.snippet?.customUrl ?? null,
      avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
    }));
  },

  async refresh(current) {
    if (!current.refreshToken) throw new ProviderError('YouTube did not give a long-lived sign-in. Connect the channel again.', 401, true);
    const { data } = await call(TOKEN, {
      form: { refresh_token: current.refreshToken, client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, grant_type: 'refresh_token' },
    }).catch((e: unknown) => {
      // invalid_grant: access was removed in the Google account, or the refresh token expired
      if (e instanceof ProviderError && e.status === 400) throw new ProviderError('YouTube access was withdrawn or has expired. Connect the channel again.', 401, true);
      throw e;
    });
    return tokens(data, current);
  },

  async publish(p) {
    const short = p.height > p.width && p.duration <= 180;
    let description = clip(p.caption, 5000);
    if (short && !/#shorts\b/i.test(`${p.title} ${description}`)) description = clip(`${description}\n\n#Shorts`.trim(), 5000);
    const start = await call(UPLOAD, {
      token: p.tokens.accessToken,
      headers: { 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(p.size) },
      json: {
        // YouTube refuses < and > in titles
        snippet: { title: clip(p.title.replace(/[<>]/g, ''), 100) || 'Clip', description: description.replace(/[<>]/g, ''), categoryId: '22' },
        status: { privacyStatus: p.privacy, selfDeclaredMadeForKids: false },
      },
      signal: p.signal,
    });
    const session = start.headers.get('location');
    if (!session) throw new ProviderError('YouTube did not open an upload session', 502, false, true);

    let sent = 0;
    for (;;) {
      const chunk = await readChunk(p.file, sent, Math.min(CHUNK, p.size - sent));
      const r = await call(session, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${sent}-${sent + chunk.length - 1}/${p.size}` },
        body: chunk,
        okStatuses: [308],
        signal: p.signal,
      });
      if (r.status === 308) {
        // "Range: bytes=0-8388607" says how much YouTube has; continue from there
        const got = /bytes=0-(\d+)/.exec(r.headers.get('range') ?? '');
        sent = got ? Number(got[1]) + 1 : sent + chunk.length;
        p.onProgress(sent / p.size);
        continue;
      }
      const id = r.data.id as string | undefined;
      if (!id) throw new ProviderError('YouTube accepted the upload but returned no video', 502);
      p.onProgress(1);
      return { externalId: id, url: short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}` };
    }
  },
};
