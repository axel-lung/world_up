'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setEffectsOn, useEffectsOn } from '@/lib/effects';
import { Button } from './Button';
import { SegmentedControl } from './SegmentedControl';

/** The pack opening's button that turns the sounds and vibrations on or off, on this device. */
export function EffectsToggle({ className }: { className?: string }) {
  const t = useTranslations('Effects');
  const on = useEffectsOn();
  return (
    <Button
      iconOnly
      className={className}
      aria-label={t('label')}
      aria-pressed={on}
      icon={on ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
      onClick={() => setEffectsOn(!on)}
    />
  );
}

/** The same choice on the profile, as two options. */
export function EffectsSwitch({ name = 'effects' }: { name?: string }) {
  const t = useTranslations('Effects');
  const on = useEffectsOn();
  return (
    <SegmentedControl
      name={name}
      ariaLabel={t('label')}
      value={on ? 'on' : 'off'}
      onValueChange={(value) => setEffectsOn(value === 'on')}
      options={[
        { value: 'on', label: t('on'), icon: <Volume2 aria-hidden /> },
        { value: 'off', label: t('off'), icon: <VolumeX aria-hidden /> },
      ]}
    />
  );
}
