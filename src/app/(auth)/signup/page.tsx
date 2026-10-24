import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SignupForm } from '@/components/account/SignupForm';
import { PLAYER_HOME } from '@/lib/collections';
import { getSession } from '@/lib/session';
import { googleSignInEnabled } from '@/lib/sign-in-methods';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.signup');
  return { title: t('title') };
}

// ?with=google opens the Google signup; Google sends the player back here,
// with ?error=…, when it fails.
export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  if (await getSession()) redirect(PLAYER_HOME);
  const params = await searchParams;
  return (
    <SignupForm
      google={googleSignInEnabled()}
      withGoogle={params.with === 'google'}
      home={PLAYER_HOME}
      googleError={typeof params.error === 'string' ? params.error : undefined}
    />
  );
}
