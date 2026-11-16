import crypto from 'node:crypto';
import { env } from '../config/env';

/*
 * Social-account tokens let the server post as a person, so they are never stored readable:
 * AES-256-GCM with a key derived from TOKEN_ENCRYPTION_KEY (or JWT_SECRET when that is not set).
 * Stored as "v1.<iv>.<tag>.<ciphertext>" (base64url).
 */
const key = crypto.hkdfSync('sha256', env.TOKEN_ENCRYPTION_KEY || env.JWT_SECRET, 'cliper-agent', 'social-tokens', 32);
const KEY = Buffer.from(key);

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** Throws when the value was tampered with or sealed under another key. */
export function open(sealed: string): string {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || body === undefined) throw new Error('Unreadable secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}
