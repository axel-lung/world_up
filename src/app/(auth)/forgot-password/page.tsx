import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForgotPasswordForm } from '@/components/account/ForgotPasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.forgot');
  return { title: t('title') };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
