'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { requireAdmin } from '@/lib/admin';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import {
  publishOdds,
  RulesError,
  updateGameRules,
  updateMarketPrices,
  updateMarketRules,
  updateResaleValues,
  updateStreakRewards,
} from '@/lib/game/admin';
import type { OddsSet } from '@/lib/game/draw';
import { getActiveCollection } from '@/lib/game/rules';
import { fromParisDateTime } from '@/lib/paris-time';
import { RARITIES, type Rarity } from '@/lib/rarity';

// Server actions are public endpoints: each one checks the admin session again.

export type RulesState = { error: RulesError['code'] | 'invalid' } | { saved: true } | null;

async function run(work: (collectionId: number, adminId: string) => Promise<void>): Promise<RulesState> {
  const { user } = await requireAdmin();
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  if (!collection) return { error: 'invalid' };
  try {
    await work(collection.id, user.id);
  } catch (error) {
    if (error instanceof RulesError) return { error: error.code };
    throw error;
  }
  refresh();
  return { saved: true };
}

const count = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const rulesSchema = z.object({
  cardsPerPack: count(1, 20),
  signupPacks: count(0, 100),
  refillMinutes: count(1, 7 * 24 * 60),
  maxReserve: count(1, 100),
  coinsPerOpening: count(0, 10_000),
});

export async function saveGameRules(_: RulesState, form: FormData): Promise<RulesState> {
  await requireAdmin();
  const input = rulesSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  return run((collectionId, adminId) => updateGameRules(db, adminId, collectionId, input.data));
}

const repairSchema = z.object({
  streakRepairCoinsPerDay: count(1, 100_000),
  streakRepairMaxCoins: count(1, 10_000_000),
});

/** What repairing a broken streak costs: so many coins per day, up to the ceiling. */
export async function saveStreakRepair(_: RulesState, form: FormData): Promise<RulesState> {
  await requireAdmin();
  const input = repairSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  return run((collectionId, adminId) => updateGameRules(db, adminId, collectionId, input.data));
}

// "3:1, 7, 30:2" -> 3 days for 1 pack, 7 for 1, 30 for 2: up to 50 milestones,
// each a different number of days. Empty: no bonus pack.
const milestones = z.string().transform((value, context) => {
  const entries = value.replace(/\s*:\s*/g, ':').split(/[\s,;]+/).filter(Boolean);
  const rewards = entries.flatMap((entry) => {
    const match = /^(\d{1,4})(?::(\d{1,3}))?$/.exec(entry);
    return match ? [{ days: Number(match[1]), packs: Number(match[2] ?? 1) }] : [];
  });
  const valid = rewards.filter((reward) => reward.days >= 1 && reward.days <= 3650 && reward.packs >= 1 && reward.packs <= 100);
  if (entries.length > 50 || valid.length !== entries.length || new Set(valid.map((reward) => reward.days)).size !== valid.length) {
    context.addIssue({ code: 'custom', message: 'milestones' });
  }
  return valid;
});

export async function saveStreakRewards(_: RulesState, form: FormData): Promise<RulesState> {
  await requireAdmin();
  const input = z.object({ milestones }).safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  return run((collectionId, adminId) => updateStreakRewards(db, adminId, collectionId, input.data.milestones));
}

const resaleSchema = z.object(
  Object.fromEntries(RARITIES.map((rarity) => [rarity, count(0, 1_000_000)])) as Record<Rarity, ReturnType<typeof count>>,
);

export async function saveResaleValues(_: RulesState, form: FormData): Promise<RulesState> {
  await requireAdmin();
  const input = resaleSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  return run((collectionId, adminId) => updateResaleValues(db, adminId, collectionId, input.data));
}

// "0,25" (percent, French or English decimal mark, up to 4 decimals) -> 2500 parts per million
const percent = z
  .string()
  .trim()
  .regex(/^\d{1,3}([.,]\d{1,4})?$/)
  .transform((value) => Math.round(Number(value.replace(',', '.')) * 10_000));

const oddsSchema = z.object({
  ...(Object.fromEntries(RARITIES.map((rarity) => [rarity, percent])) as Record<Rarity, typeof percent>),
  validFrom: z.string().transform((value, context) => {
    const date = fromParisDateTime(value);
    if (!date) context.addIssue({ code: 'custom', message: 'date' });
    return date ?? new Date(0);
  }),
});

export async function saveOdds(_: RulesState, form: FormData): Promise<RulesState> {
  await requireAdmin();
  const input = oddsSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  const { validFrom, ...odds } = input.data;
  return run((collectionId, adminId) => publishOdds(db, adminId, collectionId, odds as OddsSet, validFrom, new Date()));
}

// A checkbox sends "on" when checked, nothing otherwise
const toggle = z
  .string()
  .optional()
  .transform((value) => value === 'on');

// "24, 48, 72" -> [24, 48, 72]: one to six durations of up to two weeks
const durations = z.string().transform((value, context) => {
  const list = value.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (list.length < 1 || list.length > 6 || !list.every((hours) => Number.isInteger(hours) && hours >= 1 && hours <= 14 * 24)) {
    context.addIssue({ code: 'custom', message: 'durations' });
  }
  return [...new Set(list)].sort((a, b) => a - b);
});

const marketSchema = z.object({
  tradesEnabled: toggle,
  auctionsEnabled: toggle,
  tradeExpiryHours: count(1, 30 * 24),
  tradeMaxCards: count(1, 50),
  auctionDurationsHours: durations,
  auctionFeePercent: count(0, 50),
  bidIncrementPercent: count(1, 50),
  auctionExtensionMinutes: count(0, 60),
  maxActiveAuctions: count(1, 100),
});

export async function saveMarketRules(_: RulesState, form: FormData): Promise<RulesState> {
  await requireAdmin();
  const input = marketSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  return run((collectionId, adminId) => updateMarketRules(db, adminId, collectionId, input.data));
}

const pricesSchema = z.object(
  Object.fromEntries(
    RARITIES.flatMap((rarity) => [
      [`${rarity}Min`, count(1, 10_000_000)],
      [`${rarity}Max`, count(1, 10_000_000)],
    ]),
  ) as Record<`${Rarity}${'Min' | 'Max'}`, ReturnType<typeof count>>,
);

export async function saveMarketPrices(_: RulesState, form: FormData): Promise<RulesState> {
  await requireAdmin();
  const input = pricesSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  const prices = Object.fromEntries(
    RARITIES.map((rarity) => [rarity, { min: input.data[`${rarity}Min`], max: input.data[`${rarity}Max`] }]),
  ) as Record<Rarity, { min: number; max: number }>;
  return run((collectionId, adminId) => updateMarketPrices(db, adminId, collectionId, prices));
}
