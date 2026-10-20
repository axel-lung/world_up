'use client';

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/Button';
import { useHydrated } from '@/lib/use-hydrated';

/** Disabled while the request runs, and until the form can submit through JavaScript. */
export function SubmitButton({ pending, ...props }: { pending: boolean } & ComponentProps<typeof Button>) {
  const hydrated = useHydrated();
  return <Button type="submit" disabled={!hydrated || pending} {...props} />;
}
