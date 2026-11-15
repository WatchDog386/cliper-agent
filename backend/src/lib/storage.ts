import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

/** Absolute storage root. */
export const STORAGE_ROOT = path.resolve(env.STORAGE_DIR);

export function ensureStorage() {
  fs.mkdirSync(path.join(STORAGE_ROOT, 'jobs'), { recursive: true });
  fs.mkdirSync(path.join(STORAGE_ROOT, 'incoming'), { recursive: true });
}

/** Folder that holds one job's source, clips and thumbnails. */
export const jobDir = (jobId: string) => path.join(STORAGE_ROOT, 'jobs', jobId);

/** Where uploads land before a job takes them over. */
export const incomingDir = () => path.join(STORAGE_ROOT, 'incoming');

/** Relative path (stored in the database) → absolute path, refusing anything that escapes the root. */
export function resolveStored(rel: string) {
  const abs = path.resolve(STORAGE_ROOT, rel);
  if (!abs.startsWith(STORAGE_ROOT + path.sep)) throw new Error('Path escapes storage');
  return abs;
}

export const toStored = (abs: string) => path.relative(STORAGE_ROOT, abs).split(path.sep).join('/');

export async function removeJobFiles(jobId: string) {
  await fs.promises.rm(jobDir(jobId), { recursive: true, force: true });
}
