import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/account/LoginForm';
import { safeReturnPath } from '@/lib/return-path';
import { getSession } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.login');
  return { title: t('title') };
}

// Until the game pages exist (lot 3), players land on their account page.
const DEFAULT_RETURN_PATH = '/account';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const returnTo = safeReturnPath((await searchParams).next, DEFAULT_RETURN_PATH);
  if (await getSession()) redirect(returnTo);
  return <LoginForm returnTo={returnTo} />;
}
