import { env } from '../../config/env';
import { call, clip, ProviderError, readChunk } from '../http';
import type { Provider } from '../types';

/*
 * Facebook Pages (Facebook Login + Graph API). One sign-in connects every Page the person manages;
 * each Page gets its own token, which does not expire. Videos go up through the resumable upload.
 */
const V = 'v22.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const VIDEO = `https://graph-video.facebook.com/${V}`;

export const facebook: Provider = {
  platform: 'FACEBOOK',
  label: 'Facebook',
  noun: 'page',
  envNames: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  configured: () => Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET),
  pkce: false,
  privacy: ['public'],
  limits: { title: 255, caption: 5000, maxSeconds: 4 * 3600 },

  authorizeUrl: ({ state, redirectUri }) =>
    `https://www.facebook.com/${V}/dialog/oauth?${new URLSearchParams({
      client_id: env.FACEBOOK_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts',
      state,
    })}`,

  async exchange({ code, redirectUri }) {
    const short = await call(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: env.FACEBOOK_APP_ID, client_secret: env.FACEBOOK_APP_SECRET, redirect_uri: redirectUri, code })}`);
    // A long-lived user token makes the Page tokens below permanent
    const long = await call(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: env.FACEBOOK_APP_ID, client_secret: env.FACEBOOK_APP_SECRET, fb_exchange_token: String(short.data.access_token) })}`,
    );
    const pages = await call(`${GRAPH}/me/accounts?fields=id,name,username,access_token,picture{url}&limit=100`, { token: String(long.data.access_token) });
    const list = (pages.data.data ?? []) as { id: string; name?: string; username?: string; access_token?: string; picture?: { data?: { url?: string } } }[];
    const usable = list.filter((pg) => pg.access_token);
    if (!usable.length) throw new ProviderError('No Facebook Pages were shared. Connect again and tick the Pages you want to post to (personal profiles cannot be posted to).', 400);
    return usable.map((pg) => ({
      accessToken: pg.access_token!,
      refreshToken: null,
      expiresAt: null,
      externalId: pg.id,
      name: pg.name ?? 'Facebook Page',
      handle: pg.username ?? null,
      avatarUrl: pg.picture?.data?.url ?? null,
    }));
  },

  async publish(p) {
    const url = `${VIDEO}/${p.account.externalId}/videos`;
    const token = p.tokens.accessToken;
    const start = await call(url, { form: { upload_phase: 'start', file_size: String(p.size), access_token: token }, signal: p.signal });
    const session = String(start.data.upload_session_id);
    const videoId = String(start.data.video_id);
    let from = Number(start.data.start_offset);
    let to = Number(start.data.end_offset);
    // Facebook says which bytes it wants next, until both offsets meet at the end of the file
    while (from < to) {
      const chunk = await readChunk(p.file, from, to - from);
      const form = new FormData();
      form.set('upload_phase', 'transfer');
      form.set('upload_session_id', session);
      form.set('start_offset', String(from));
      form.set('access_token', token);
      form.set('video_file_chunk', new Blob([new Uint8Array(chunk)], { type: 'application/octet-stream' }), 'chunk.mp4');
      const r = await call(url, { body: form, signal: p.signal });
      from = Number(r.data.start_offset);
      to = Number(r.data.end_offset);
      p.onProgress(Math.min(1, from / p.size));
    }
    await call(url, {
      form: { upload_phase: 'finish', upload_session_id: session, access_token: token, title: clip(p.title, 255), description: clip(p.caption || p.title, 5000) },
      signal: p.signal,
    });
    return { externalId: videoId, url: `https://www.facebook.com/${p.account.externalId}/videos/${videoId}` };
  },
};
