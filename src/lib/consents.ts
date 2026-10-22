import { and, eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/db';
import { consents } from '@/db/schema';
import { TERMS_VERSION } from './account-rules';

async function acceptedTerms(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: consents.id })
    .from(consents)
    .where(and(eq(consents.userId, userId), eq(consents.document, 'terms'), eq(consents.version, TERMS_VERSION)))
    .limit(1);
  return Boolean(row);
}

/** Whether the player accepted the current version of the terms of use; cached for the request. */
export const hasAcceptedTerms = cache(acceptedTerms);

/** Records the player's acceptance of the current terms, once. */
export async function acceptTerms(userId: string): Promise<void> {
  if (await acceptedTerms(userId)) return;
  await db.insert(consents).values({ userId, document: 'terms', version: TERMS_VERSION });
}
