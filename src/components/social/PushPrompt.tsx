'use client';

import { Bell } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { appBuild, isNativeApp } from '@/lib/native-app';
import { appPushState, turnAppPushOn } from '@/lib/notifications/app-push-device';
import { needsPushPrompt, promptMemory, pushPromptKey } from '@/lib/notifications/push-prompt';
import styles from './PushPrompt.module.css';

const subscribe = () => () => {};

/**
 * In the app, asks a player whose phone doesn't get the notifications to turn
 * them on, in a modal: once after each sign-in (`signedInAt`, the session's
 * creation) and once after each update of the app (push-prompt.ts). Never on
 * /activity, whose switch does the same. Renders nothing in a browser.
 */
export function PushPrompt({ signedInAt }: { signedInAt: number }) {
  const pathname = usePathname();
  // Known once React runs in the page; false in the server's HTML
  const inApp = useSyncExternalStore(subscribe, isNativeApp, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  const checking = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!inApp || pathname === '/activity' || checking.current) return;
    checking.current = true;
    void (async () => {
      try {
        const key = pushPromptKey(signedInAt, await appBuild());
        const ask = await needsPushPrompt(key, promptMemory, appPushState);
        if (ask && dialog.current && !dialog.current.open) dialog.current.showModal();
      } finally {
        checking.current = false;
      }
    })();
  }, [inApp, signedInAt, pathname]);

  async function turnOn() {
    setPending(true);
    setFailed(false);
    try {
      // The phone asks its own permission; a refusal there closes this too
      await turnAppPushOn();
      dialog.current?.close();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  if (!inApp) return null;
  return (
    <dialog ref={dialog} className={styles.prompt} aria-labelledby="push-prompt-title">
      <PushPromptPanel
        titleId="push-prompt-title"
        pending={pending}
        failed={failed}
        onLater={() => dialog.current?.close()}
        onTurnOn={turnOn}
      />
    </dialog>
  );
}

/** The prompt's content, also shown on /design. */
export function PushPromptPanel({
  titleId,
  pending = false,
  failed = false,
  onLater,
  onTurnOn,
}: {
  titleId?: string;
  pending?: boolean;
  failed?: boolean;
  onLater?: () => void;
  onTurnOn?: () => void;
}) {
  const t = useTranslations('Activity.prompt');
  const ownId = useId();
  const id = titleId ?? ownId;
  return (
    <section className={`dialog ${styles.panel}`} aria-labelledby={id}>
      <span className={styles.icon} aria-hidden="true">
        <Bell />
      </span>
      <h2 id={id} className="dialog-title">
        {t('title')}
      </h2>
      <div className={`dialog-body ${styles.body}`}>
        <p>{t('body')}</p>
        <p className={styles.hint}>{t('hint')}</p>
      </div>
      {failed && (
        <Notice tone="danger">
          <p>{t('failed')}</p>
        </Notice>
      )}
      <div className={`dialog-actions ${styles.actions}`}>
        <Button onClick={onLater} disabled={pending}>
          {t('later')}
        </Button>
        <Button variant="primary" icon={<Bell aria-hidden />} onClick={onTurnOn} disabled={pending}>
          {t('turnOn')}
        </Button>
      </div>
    </section>
  );
}
