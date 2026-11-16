import type { Platform } from '@prisma/client';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  /** When the access token stops working (undefined: it does not expire). */
  expiresAt?: Date | null;
  scopes?: string | null;
}

/** What a platform told us about the channel / page / profile that was connected. */
export interface ConnectedAccount extends TokenSet {
  externalId: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
}

export type Privacy = 'public' | 'unlisted' | 'private';

export interface PublishInput {
  tokens: TokenSet;
  account: { externalId: string; name: string; handle: string | null };
  /** The clip on disk. */
  file: string;
  size: number;
  width: number;
  height: number;
  duration: number;
  title: string;
  caption: string;
  privacy: Privacy;
  /** A link the platform can download the clip from (only when the server has a public address). */
  publicVideoUrl: string | null;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

export interface PublishResult {
  externalId: string;
  url: string | null;
}

export interface Provider {
  platform: Platform;
  /** "YouTube", "X (Twitter)" … */
  label: string;
  /** What gets connected: "channel", "page", "account". */
  noun: string;
  /** Whether the server has this platform's developer-app credentials. */
  configured(): boolean;
  /** The settings that must be filled in (for the "not set up" hint). */
  envNames: [string, string];
  pkce: boolean;
  /** Privacy choices the platform understands (the first is the default). */
  privacy: Privacy[];
  limits: { title?: number; caption: number; maxSeconds: number };
  authorizeUrl(p: { state: string; redirectUri: string; challenge?: string }): string;
  /** Trade the code for tokens and look up who connected. One sign-in may yield several accounts (Facebook pages). */
  exchange(p: { code: string; redirectUri: string; verifier?: string }): Promise<ConnectedAccount[]>;
  /** New tokens when the access token is about to expire (absent: the token cannot be renewed). */
  refresh?(tokens: TokenSet): Promise<TokenSet>;
  publish(input: PublishInput): Promise<PublishResult>;
}
