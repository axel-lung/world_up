'use server';

import { z } from 'zod';
import { getSession } from '@/lib/session';
import { deletePushSubscription, isPushDevice, pushPublicKey, pushSubscriptionInput, savePushSubscription } from './push';

// Called by the /activity switch (PushSwitch) and by signing out
// (forgetPushDevice()), with the browser's PushSubscription.

const endpoint = z.string().max(1024);

/** Turns notifications on for the signed-in player on this device. */
export async function savePushDeviceAction(subscription: unknown): Promise<boolean> {
  const input = pushSubscriptionInput.safeParse(subscription);
  const session = await getSession();
  if (!input.success || !session || !pushPublicKey()) return false;
  await savePushSubscription(session.user.id, input.data, new Date());
  return true;
}

/** Whether this device notifies the signed-in player. */
export async function isPushDeviceAction(address: unknown): Promise<boolean> {
  const input = endpoint.safeParse(address);
  const session = await getSession();
  return input.success && session !== null && (await isPushDevice(session.user.id, input.data));
}

/** Turns notifications off on this device for the signed-in player. */
export async function deletePushDeviceAction(address: unknown): Promise<void> {
  const input = endpoint.safeParse(address);
  const session = await getSession();
  if (input.success && session) await deletePushSubscription(session.user.id, input.data);
}
