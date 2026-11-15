import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { signToken } from '../../lib/jwt';
import { passwordSchema } from '../../lib/password';
import { badRequest, forbidden, unauthorized } from '../../lib/http-error';
import { ah } from '../../middleware/async';
import { forgetUser, me, requireAuth } from '../../middleware/auth';
import { parse } from '../../middleware/validate';

export const authRouter = Router();

export const userView = (u: User) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt });
const session = (u: User) => ({ token: signToken({ sub: u.id, role: u.role, name: u.name, sv: u.sessionVersion }), user: userView(u) });

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);

authRouter.post(
  '/register',
  ah(async (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(2, 'Enter your name').max(80), email, password: passwordSchema }), req.body);
    const count = await prisma.user.count();
    // The first account is always allowed (it becomes the admin), even with sign-up switched off
    if (count > 0 && !env.ALLOW_SIGNUP) throw forbidden('Sign-up is closed on this server. Ask the admin for an account.');
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw badRequest('An account with this email already exists. Sign in instead.', 'EMAIL_TAKEN');
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 11), role: count === 0 ? 'ADMIN' : 'USER' },
    });
    res.status(201).json(session(user));
  }),
);

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const body = parse(z.object({ email, password: z.string().min(1, 'Enter your password') }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Same answer for "no such user" and "wrong password"
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) throw unauthorized('Email or password is incorrect');
    if (!user.active) throw unauthorized('This account has been deactivated');
    res.json(session(user));
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me(req).id } });
    res.json({ user: userView(user) });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
    const user = await prisma.user.update({ where: { id: me(req).id }, data: { name: body.name } });
    forgetUser(user.id);
    res.json({ user: userView(user) });
  }),
);

/** Changing the password signs every other device out (their tokens carry the old session version). */
authRouter.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: me(req).id } });
    if (!(await bcrypt.compare(body.currentPassword, current.passwordHash))) throw badRequest('Your current password is incorrect', 'WRONG_PASSWORD');
    const user = await prisma.user.update({
      where: { id: current.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 11), sessionVersion: { increment: 1 } },
    });
    forgetUser(user.id);
    res.json(session(user));
  }),
);
