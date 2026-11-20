'use client';

import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactNode, type SyntheticEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './Sheet.module.css';

// The history entry an open sheet adds, so that Back closes it
const MARK = 'worldupSheet';

export interface SheetTrigger {
  /** What the button shows. */
  content: ReactNode;
  className?: string;
  /** Its accessible name, when `content` has no text. */
  label?: string;
  disabled?: boolean;
}

/**
 * A bottom sheet on a native modal <dialog>: the focus stays inside, and goes
 * back to the button that opened it. A tap on the shade, the close button,
 * Escape and Back (the phone's button too: opening adds a history entry) close
 * it. Three ways in:
 * - `trigger`: a button opens it. Links inside should `replace`, so that the
 *   page they lead to takes the sheet's history entry; with `closeOnSubmit`, a
 *   form sent closes it, its action redirecting with `replace` for the same reason.
 * - `closeHref`: the address opens it (an offer, `?offer=12`), so it is open
 *   from the start; closing it goes to `closeHref`.
 * - `inline` with a trigger: from 720 px, the content shows in the page as it
 *   is, without the sheet or its button (the account's forms).
 */
export function Sheet({
  title,
  trigger,
  closeHref,
  inline = false,
  closeOnSubmit = false,
  children,
}: {
  title: string;
  trigger?: SheetTrigger;
  closeHref?: string;
  inline?: boolean;
  closeOnSubmit?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('Sheet');
  const router = useRouter();
  const id = useId();
  const titleId = `${id}-title`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Open: a sheet opened by the address is from the start. Closed, it isn't a
  // dialog for assistive technologies; inline, its content is part of the page.
  const [shown, setShown] = useState(Boolean(closeHref));
  const asPage = inline && !shown;

  const isMarked = useCallback(() => window.history.state?.[MARK] === id, [id]);

  const open = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setShown(true);
    window.history.pushState({ ...window.history.state, [MARK]: id }, '');
  };

  const close = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    if (closeHref) {
      dialog.close();
      router.replace(closeHref, { scroll: false });
    } else if (isMarked()) {
      // Back to the entry before the sheet, which closes it (below)
      window.history.back();
    } else {
      dialog.close();
    }
  }, [closeHref, isMarked, router]);

  // Opened by the address: open from the start
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!closeHref || !dialog || dialog.open) return;
    dialog.showModal();
  }, [closeHref]);

  // Back, from the phone's button, the browser's or the close button
  useEffect(() => {
    if (closeHref) return;
    const onPopState = () => {
      if (!isMarked()) dialogRef.current?.close();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [closeHref, isMarked]);

  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    // Escape: closed the same way as by the button
    event.preventDefault();
    close();
  };

  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    // The shade around the panel is the dialog itself
    if (event.target === dialog) {
      close();
      return;
    }
    // A link followed: its page takes the sheet's place (links inside replace).
    // Next's Link prevents the default itself, to navigate in the page.
    if ((event.target as Element).closest('a[href]')) dialog.close();
  };

  return (
    <>
      {trigger && (
        <button
          type="button"
          className={[trigger.className, inline && 'phone-only'].filter(Boolean).join(' ')}
          aria-label={trigger.label}
          aria-haspopup="dialog"
          disabled={trigger.disabled}
          onClick={open}
        >
          {trigger.content}
        </button>
      )}
      <dialog
        ref={dialogRef}
        className={styles.sheet}
        data-sheet
        data-inline={inline || undefined}
        role={asPage ? 'none' : undefined}
        aria-labelledby={shown ? titleId : undefined}
        onCancel={onCancel}
        onClose={() => setShown(false)}
        onClick={onClick}
        onSubmit={closeOnSubmit ? () => dialogRef.current?.close() : undefined}
      >
        <div className={styles.panel}>
          <div className={styles.chrome}>
            <span className={styles.handle} aria-hidden="true" />
            <div className={styles.head}>
              <h2 id={titleId}>{title}</h2>
              <button type="button" className={styles.close} aria-label={t('close')} onClick={close}>
                <X aria-hidden />
              </button>
            </div>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
