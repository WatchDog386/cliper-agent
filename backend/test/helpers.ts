import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();

let n = 0;
/** A fresh account; returns its token and auth header. */
export async function signUp(name = 'Test User') {
  const email = `user${Date.now()}${n++}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'Password123' });
  if (res.status !== 201) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, user: res.body.user as { id: string; role: string }, email, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export const resetDb = async () => {
  await prisma.publication.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.oAuthState.deleteMany();
  await prisma.clip.deleteMany();
  await prisma.clipJob.deleteMany();
  await prisma.user.deleteMany();
};
