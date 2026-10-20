'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { requireAdmin } from '@/lib/admin';
import { CatalogError, HIDDEN_REASONS, setCardPhoto, setCardRarity, setCardVisibility } from '@/lib/catalog/admin';
import { importCommonsPhoto, PhotoRejected } from '@/lib/catalog/commons-photo';
import { RARITIES } from '@/lib/rarity';

// Server actions are public endpoints: each one checks the admin session again.

export type ErrorCode =
  | 'noPhoto'
  | 'rarityUnchanged'
  | 'confirmRequired'
  | 'invalid'
  | 'photoMissing'
  | 'photoTooSmall'
  | 'photoLicense'
  | 'photoDownload';
export type ActionState = { error: ErrorCode } | { saved: true } | null;

const cardId = z.coerce.number().int().positive();

async function run(work: () => Promise<void>): Promise<ActionState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof PhotoRejected) return { error: error.code };
    if (error instanceof CatalogError && error.code !== 'notFound') return { error: error.code };
    throw error;
  }
  refresh();
  return { saved: true };
}

const visibilitySchema = z.object({
  cardId,
  reason: z.enum(['visible', ...HIDDEN_REASONS]),
  note: z.string().trim().max(500).optional(),
});

export async function changeVisibility(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireAdmin();
  const input = visibilitySchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  const { reason, note } = input.data;
  return run(() => setCardVisibility(db, user.id, input.data.cardId, reason === 'visible' ? null : reason, note || null));
}

const raritySchema = z.object({ cardId, rarity: z.enum(RARITIES), confirm: z.literal('on').optional() });

export async function changeRarity(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireAdmin();
  const input = raritySchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  if (!input.data.confirm) return { error: 'confirmRequired' };
  return run(() => setCardRarity(db, user.id, input.data.cardId, input.data.rarity));
}

const photoSchema = z.object({ cardId, file: z.string().trim().min(1).max(500) });

export async function changePhoto(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireAdmin();
  const input = photoSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  return run(async () => {
    const photo = await importCommonsPhoto(input.data.file);
    await setCardPhoto(db, user.id, input.data.cardId, photo);
  });
}
