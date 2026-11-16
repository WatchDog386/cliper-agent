import { env } from '../../config/env';
import { call, clip, inSeconds, oneText, poll, ProviderError, readChunk } from '../http';
import type { Provider } from '../types';

/*
 * LinkedIn (Sign in with LinkedIn + "Share on LinkedIn": posts to the person's own profile).
 * LinkedIn's access lasts about 60 days and cannot be renewed silently, so the account then has to be
 * connected again.
 */
const REST = 'https://api.linkedin.com/rest';

/** LinkedIn's API is versioned by month and drops versions after a year: use the one from two months ago. */
function version(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const headers = () => ({ 'LinkedIn-Version': version(), 'X-Restli-Protocol-Version': '2.0.0' });

export const linkedin: Provider = {
  platform: 'LINKEDIN',
  label: 'LinkedIn',
  noun: 'profile',
  envNames: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  configured: () => Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET),
  pkce: false,
  privacy: ['public', 'private'],
  limits: { title: 100, caption: 3000, maxSeconds: 15 * 60 },

  authorizeUrl: ({ state, redirectUri }) =>
    `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
      response_type: 'code',
      client_id: env.LINKEDIN_CLIENT_ID,
      redirect_uri: redirectUri,
      state,
      scope: 'openid profile w_member_social',
    })}`,

  async exchange({ code, redirectUri }) {
    const { data } = await call('https://www.linkedin.com/oauth/v2/accessToken', {
      form: { grant_type: 'authorization_code', code, client_id: env.LINKEDIN_CLIENT_ID, client_secret: env.LINKEDIN_CLIENT_SECRET, redirect_uri: redirectUri },
    });
    const accessToken = String(data.access_token);
    const me = await call('https://api.linkedin.com/v2/userinfo', { token: accessToken });
    const u = me.data as { sub?: string; name?: string; picture?: string };
    if (!u.sub) throw new ProviderError('LinkedIn did not say who signed in', 502);
    return [
      {
        accessToken,
        refreshToken: (data.refresh_token as string | undefined) ?? null,
        expiresAt: inSeconds(data.expires_in),
        scopes: (data.scope as string | undefined) ?? null,
        externalId: u.sub,
        name: u.name ?? 'LinkedIn profile',
        handle: null,
        avatarUrl: u.picture ?? null,
      },
    ];
  },

  async publish(p) {
    const token = p.tokens.accessToken;
    const owner = `urn:li:person:${p.account.externalId}`;
    const init = await call(`${REST}/videos?action=initializeUpload`, {
      token,
      headers: headers(),
      json: { initializeUploadRequest: { owner, fileSizeBytes: p.size, uploadCaptions: false, uploadThumbnail: false } },
      signal: p.signal,
    });
    const v = (init.data.value ?? {}) as { video?: string; uploadToken?: string; uploadInstructions?: { uploadUrl: string; firstByte: number; lastByte: number }[] };
    if (!v.video || !v.uploadInstructions?.length) throw new ProviderError('LinkedIn did not open an upload', 502, false, true);

    // LinkedIn says how to cut the file; each piece answers with an ETag that proves it arrived
    const parts: string[] = [];
    for (const part of v.uploadInstructions) {
      const chunk = await readChunk(p.file, part.firstByte, part.lastByte - part.firstByte + 1);
      const r = await call(part.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk, signal: p.signal });
      const etag = r.headers.get('etag');
      if (!etag) throw new ProviderError('LinkedIn did not confirm part of the upload', 502, false, true);
      parts.push(etag.replace(/^"|"$/g, ''));
      p.onProgress(((part.lastByte + 1) / p.size) * 0.85);
    }
    await call(`${REST}/videos?action=finalizeUpload`, {
      token,
      headers: headers(),
      json: { finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken ?? '', uploadedPartIds: parts } },
      signal: p.signal,
    });

    await poll(
      async () => {
        const s = await call(`${REST}/videos/${encodeURIComponent(v.video!)}`, { token, headers: headers(), signal: p.signal });
        if (s.data.status === 'PROCESSING_FAILED') throw new ProviderError('LinkedIn could not process the video', 400);
        return s.data.status === 'AVAILABLE' ? true : undefined;
      },
      { everyMs: 5000, timeoutMs: 10 * 60_000, signal: p.signal, what: 'LinkedIn processing' },
    );

    const post = await call(`${REST}/posts`, {
      token,
      headers: headers(),
      json: {
        author: owner,
        commentary: oneText(p.title, p.caption, 3000),
        visibility: p.privacy === 'private' ? 'CONNECTIONS' : 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { title: clip(p.title, 100), id: v.video } },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      },
      signal: p.signal,
    });
    const urn = post.headers.get('x-restli-id') ?? String(post.data.id ?? v.video);
    p.onProgress(1);
    return { externalId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
  },
};

export const _linkedinVersion = version;
