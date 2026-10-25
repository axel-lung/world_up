'use client';

import { Bell, BellOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { type PushState, pushState, turnPushOff, turnPushOn } from '@/lib/notifications/push-device';
import styles from './PushSwitch.module.css';

/**
 * Web Push on this device: the player turns it on or off here. Reads the
 * browser's state once mounted; until then, and where push can't work, the
 * button stays hidden.
 */
export function PushSwitch({ publicKey }: { publicKey: string }) {
  const t = useTranslations('Activity.push');
  const [state, setState] = useState<PushState | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pushState(publicKey).then(
      (value) => live && setState(value),
      () => live && setState('off'),
    );
    return () => {
      live = false;
    };
  }, [publicKey]);

  async function change(on: boolean) {
    setPending(true);
    setFailed(false);
    try {
      if (on) {
        setState(await turnPushOn(publicKey));
      } else {
        await turnPushOff();
        setState('off');
      }
    } catch {
      setFailed(true);
      setState(await pushState(publicKey).catch(() => 'off' as const));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="push-title">
      <div className={styles.text}>
        <h2 id="push-title">{t('title')}</h2>
        {state && <p>{t(state)}</p>}
      </div>
      {state === 'off' && (
        <Button variant="primary" icon={<Bell aria-hidden />} disabled={pending} onClick={() => change(true)}>
          {t('turnOn')}
        </Button>
      )}
      {state === 'on' && (
        <Button variant="ghost" icon={<BellOff aria-hidden />} disabled={pending} onClick={() => change(false)}>
          {t('turnOff')}
        </Button>
      )}
      {failed && (
        <div className={styles.error}>
          <Notice tone="danger">
            <p>{t('failed')}</p>
          </Notice>
        </div>
      )}
    </section>
  );
}
