import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';

export interface TokenPayload {
  sub: string;
  role: Role;
  name: string;
  /** Session version the token was issued under; raised to sign a person out of every device. */
  sv?: number;
  typ?: 'session';
}

export const signToken = (payload: TokenPayload) =>
  jwt.sign({ ...payload, typ: 'session' }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] });

export function verifyToken(token: string) {
  const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload & jwt.JwtPayload & { typ?: string };
  // A media link token must never work as a session
  if (payload.typ && payload.typ !== 'session') throw new Error('Wrong token type');
  return payload;
}

/*
 * Media links. <video> tags and download links cannot send an Authorization header, so each job's clip
 * URLs carry a short-lived token that only opens that job's files (never the API).
 */
interface MediaPayload {
  sub: string;
  job: string;
  typ: 'media';
}

export const signMediaToken = (userId: string, jobId: string) =>
  jwt.sign({ sub: userId, job: jobId, typ: 'media' } satisfies MediaPayload, env.JWT_SECRET, { expiresIn: '12h' });

export function verifyMediaToken(token: string): MediaPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as MediaPayload & jwt.JwtPayload;
  if (payload.typ !== 'media') throw new Error('Wrong token type');
  return payload;
}
