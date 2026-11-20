import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { BrandKit } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/http-error';
import { STORAGE_ROOT, resolveStored, toStored } from '../../lib/storage';
import { ah } from '../../middleware/async';
import { me } from '../../middleware/auth';
import { parse } from '../../middleware/validate';

/*
 * Brand kits: a name, two colours and a logo. Clips rendered with a kit get the logo stamped in a
 * corner (see clipper/filters.ts). Logos are small, so they travel to the app as data URIs.
 */
export const brandRouter = Router();

const LOGO_MAX = 1024 * 1024;
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const brandDir = () => path.join(STORAGE_ROOT, 'brand');

async function kitView(k: BrandKit) {
  let logoUrl: string | null = null;
  if (k.logo) {
    const buf = await fs.promises.readFile(resolveStored(k.logo)).catch(() => null);
    if (buf) logoUrl = `data:${MIME[path.extname(k.logo).toLowerCase()] ?? 'image/png'};base64,${buf.toString('base64')}`;
  }
  return {
    id: k.id,
    name: k.name,
    primaryColor: k.primaryColor,
    secondaryColor: k.secondaryColor,
    logoUrl,
    logoPosition: k.logoPosition,
    logoSize: k.logoSize,
    logoOpacity: k.logoOpacity,
    isDefault: k.isDefault,
    createdAt: k.createdAt,
  };
}

async function ownKit(userId: string, id: string) {
  const k = await prisma.brandKit.findFirst({ where: { id, userId } });
  if (!k) throw notFound('Brand kit');
  return k;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colours are written like #C8FF2E');
const kitBody = z.object({
  name: z.string().trim().min(1, 'Name the brand kit').max(60),
  primaryColor: hex.optional(),
  secondaryColor: hex.optional(),
  logoPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
  logoSize: z.number().int().min(4).max(40).optional(),
  logoOpacity: z.number().min(0.1).max(1).optional(),
  isDefault: z.boolean().optional(),
});

/** Only one default kit per person. */
async function makeDefault(userId: string, id: string) {
  await prisma.brandKit.updateMany({ where: { userId, NOT: { id } }, data: { isDefault: false } });
}

brandRouter.get(
  '/',
  ah(async (req, res) => {
    const kits = await prisma.brandKit.findMany({ where: { userId: me(req).id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    res.json({ kits: await Promise.all(kits.map(kitView)) });
  }),
);

brandRouter.post(
  '/',
  ah(async (req, res) => {
    const body = parse(kitBody, req.body);
    const userId = me(req).id;
    if ((await prisma.brandKit.count({ where: { userId } })) >= 20) throw badRequest('You can keep up to 20 brand kits');
    const first = (await prisma.brandKit.count({ where: { userId } })) === 0;
    const kit = await prisma.brandKit.create({ data: { ...body, userId, isDefault: body.isDefault ?? first } });
    if (kit.isDefault) await makeDefault(userId, kit.id);
    res.status(201).json({ kit: await kitView(kit) });
  }),
);

brandRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const body = parse(kitBody.partial(), req.body);
    const k = await ownKit(me(req).id, String(req.params.id));
    const kit = await prisma.brandKit.update({ where: { id: k.id }, data: body });
    if (body.isDefault) await makeDefault(k.userId, k.id);
    res.json({ kit: await kitView(kit) });
  }),
);

brandRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const k = await ownKit(me(req).id, String(req.params.id));
    await prisma.brandKit.delete({ where: { id: k.id } });
    if (k.logo) await fs.promises.rm(resolveStored(k.logo), { force: true });
    res.status(204).end();
  }),
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX, files: 1 },
  fileFilter: (_req, file, cb) => (Object.values(MIME).includes(file.mimetype) ? cb(null, true) : cb(badRequest('The logo must be a PNG, JPEG or WebP image'))),
});

/** Upload or replace the logo (multipart field "file", up to 1 MB; a transparent PNG looks best). */
brandRouter.post(
  '/:id/logo',
  upload.single('file'),
  ah(async (req, res) => {
    const k = await ownKit(me(req).id, String(req.params.id));
    if (!req.file) throw badRequest('Choose an image to upload');
    const ext = Object.entries(MIME).find(([, m]) => m === req.file!.mimetype)?.[0] ?? '.png';
    await fs.promises.mkdir(brandDir(), { recursive: true });
    const file = path.join(brandDir(), `${k.id}-${Date.now()}${ext}`);
    await fs.promises.writeFile(file, req.file.buffer);
    if (k.logo) await fs.promises.rm(resolveStored(k.logo), { force: true });
    const kit = await prisma.brandKit.update({ where: { id: k.id }, data: { logo: toStored(file) } });
    res.json({ kit: await kitView(kit) });
  }),
);

brandRouter.delete(
  '/:id/logo',
  ah(async (req, res) => {
    const k = await ownKit(me(req).id, String(req.params.id));
    if (k.logo) await fs.promises.rm(resolveStored(k.logo), { force: true });
    const kit = await prisma.brandKit.update({ where: { id: k.id }, data: { logo: null } });
    res.json({ kit: await kitView(kit) });
  }),
);
