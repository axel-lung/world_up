import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/account/LoginForm';
import { PLAYER_HOME } from '@/lib/collections';
import { safeReturnPath } from '@/lib/return-path';
import { getSession } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.login');
  return { title: t('title') };
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const returnTo = safeReturnPath((await searchParams).next, PLAYER_HOME);
  if (await getSession()) redirect(returnTo);
  return <LoginForm returnTo={returnTo} />;
}
