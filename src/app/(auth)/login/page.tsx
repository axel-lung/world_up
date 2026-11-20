import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/account/LoginForm';
import { PLAYER_HOME } from '@/lib/collections';
import { safeReturnPath } from '@/lib/return-path';
import { googleErrorFrom } from '@/lib/google-error';
import { getSession } from '@/lib/session';
import { googleSignInEnabled } from '@/lib/sign-in-methods';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.login');
  return { title: t('title') };
}

// Also where Google sends the player back when signing in fails, with ?error=…
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.next, PLAYER_HOME);
  if (await getSession()) redirect(returnTo);
  return <LoginForm returnTo={returnTo} google={googleSignInEnabled()} googleError={googleErrorFrom(params)} />;
}
