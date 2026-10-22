'use server';

import { redirect } from 'next/navigation';
import { PLAYER_HOME } from '@/lib/collections';
import { acceptTerms } from '@/lib/consents';
import { safeReturnPath } from '@/lib/return-path';
import { getSession } from '@/lib/session';

export type AcceptTermsState = { error: 'required' } | null;

// Server actions are public endpoints: the session is checked again here.
export async function acceptTermsAction(_state: AcceptTermsState, form: FormData): Promise<AcceptTermsState> {
  const session = await getSession();
  if (!session) redirect('/login?next=%2Faccept-terms');
  if (form.get('accept') !== 'on') return { error: 'required' };
  await acceptTerms(session.user.id);
  redirect(safeReturnPath(form.get('next')?.toString(), PLAYER_HOME));
}
