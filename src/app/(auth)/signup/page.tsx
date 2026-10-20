import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SignupForm } from '@/components/account/SignupForm';
import { getSession } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.signup');
  return { title: t('title') };
}

export default async function SignupPage() {
  if (await getSession()) redirect('/account');
  return <SignupForm />;
}
