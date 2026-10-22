import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PLAYER_HOME } from '@/lib/collections';
import { hasAcceptedTerms } from '@/lib/consents';
import { safeReturnPath } from '@/lib/return-path';
import { getSession } from '@/lib/session';
import { AcceptTermsForm } from './AcceptTermsForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AcceptTerms');
  return { title: t('title') };
}

// Where requireSession() sends a player who has not accepted the current terms
// of use (a new version since signup), before going on to `next`.
export default async function AcceptTermsPage({ searchParams }: PageProps<'/accept-terms'>) {
  const next = safeReturnPath((await searchParams).next, PLAYER_HOME);
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (await hasAcceptedTerms(session.user.id)) redirect(next);
  return <AcceptTermsForm next={next} />;
}
