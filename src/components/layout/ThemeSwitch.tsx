'use client';

import { Moon, Sun, SunMoon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { themeAttribute, themeCookie, type ThemePreference } from '@/lib/theme-preference';

/**
 * The theme choice, in the footer and on a phone's profile: follow the device,
 * or force light or dark on every page. Two on a page need two `name`s. Each
 * choice's name is in a `seg-label` span, which the profile keeps for screen
 * readers only, beside the icon.
 */
export function ThemeSwitch({ initial, name = 'theme' }: { initial: ThemePreference; name?: string }) {
  const t = useTranslations('Theme');
  const [preference, setPreference] = useState(initial);

  const choose = (next: ThemePreference) => {
    setPreference(next);
    // The page changes at once; the cookie has the server render the next ones the same way.
    const theme = themeAttribute(next);
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    document.cookie = themeCookie(next, window.location.protocol === 'https:');
  };

  return (
    <SegmentedControl
      name={name}
      ariaLabel={t('label')}
      value={preference}
      onValueChange={choose}
      options={[
        { value: 'system', label: t('system'), icon: <SunMoon aria-hidden /> },
        { value: 'light', label: t('light'), icon: <Sun aria-hidden /> },
        { value: 'dark', label: t('dark'), icon: <Moon aria-hidden /> },
      ]}
    />
  );
}
