'use client';

import { Bell, BellOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { isNativeApp } from '@/lib/native-app';
import { appPushState, turnAppPushOff, turnAppPushOn } from '@/lib/notifications/app-push-device';
import { type PushState, pushState, turnPushOff, turnPushOn } from '@/lib/notifications/push-device';
import styles from './PushSwitch.module.css';

const subscribe = () => () => {};

interface Device {
  state: () => Promise<PushState>;
  turnOn: () => Promise<PushState>;
  turnOff: () => Promise<void>;
}

/** Web Push in a browser, with the server's VAPID key; Firebase in the app. Null where it's off. */
function thisDevice(publicKey: string | null, app: boolean, inApp: boolean): Device | null {
  if (inApp) return app ? { state: appPushState, turnOn: turnAppPushOn, turnOff: turnAppPushOff } : null;
  if (!publicKey) return null;
  return { state: () => pushState(publicKey), turnOn: () => turnPushOn(publicKey), turnOff: turnPushOff };
}

/**
 * Notifications on this device: the player turns them on or off here. Reads
 * the device's state once mounted; until then, and where push can't work, the
 * button stays hidden. `publicKey`: Web Push's, null while it's off; `app`:
 * whether the server sends to the app.
 */
export function PushSwitch({ publicKey, app }: { publicKey: string | null; app: boolean }) {
  const t = useTranslations('Activity.push');
  // Known once React runs in the browser; undefined in the server's HTML
  const inApp = useSyncExternalStore(subscribe, isNativeApp, () => undefined);
  const device = useMemo(
    () => (inApp === undefined ? undefined : thisDevice(publicKey, app, inApp)),
    [publicKey, app, inApp],
  );
  const [state, setState] = useState<PushState | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    device?.state().then(
      (value) => live && setState(value),
      () => live && setState('off'),
    );
    return () => {
      live = false;
    };
  }, [device]);

  async function change(on: boolean) {
    if (!device) return;
    setPending(true);
    setFailed(false);
    try {
      if (on) {
        setState(await device.turnOn());
      } else {
        await device.turnOff();
        setState('off');
      }
    } catch {
      setFailed(true);
      setState(await device.state().catch(() => 'off' as const));
    } finally {
      setPending(false);
    }
  }

  // This browser, or the app, can't be notified by the server
  if (device === null) return null;

  return (
    <section className={styles.panel} aria-labelledby="push-title">
      <div className={styles.text}>
        <h2 id="push-title">{t('title')}</h2>
        {/* The app's texts speak of the app and the phone's settings */}
        {state && <p>{t(inApp && (state === 'off' || state === 'denied') ? `${state}App` : state)}</p>}
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
