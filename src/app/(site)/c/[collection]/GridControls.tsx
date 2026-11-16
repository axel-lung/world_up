'use client';

import { LayoutGrid, List } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ComponentProps, useEffect, useState, useTransition } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { type CollectionView, collectionViewCookie } from '@/lib/collection-view';
import styles from './game.module.css';

/** The grid or the list: the choice is kept in a cookie, and the server lays the cards out again. */
export function ViewSwitch({ initial, labels }: { initial: CollectionView; labels: { label: string; grid: string; list: string } }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [, startTransition] = useTransition();
  const choose = (next: CollectionView) => {
    setView(next);
    document.cookie = collectionViewCookie(next, window.location.protocol === 'https:');
    startTransition(() => router.refresh());
  };
  return (
    <div className={styles.viewSwitch}>
      <SegmentedControl
        name="collection-view"
        ariaLabel={labels.label}
        value={view}
        onValueChange={choose}
        options={[
          { value: 'grid', label: labels.grid, icon: <LayoutGrid aria-hidden /> },
          { value: 'list', label: labels.list, icon: <List aria-hidden /> },
        ]}
      />
    </div>
  );
}

/** A filter's list that applies as soon as an option is picked; its form's button only shows without JavaScript. */
export function AutoSubmitSelect(props: ComponentProps<'select'>) {
  return <select {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}

const FOCUS_KEY = 'worldup.loadMoreFocus';

/**
 * "Voir plus": the address asks for one more page, and the grid comes back
 * longer, scrolled where it was. `next` is the id of the first card it brings,
 * which FocusBroughtCards then focuses.
 */
export function LoadMore({
  href,
  next,
  label,
  status,
  hint,
}: {
  href: string | null;
  next: string;
  label: string;
  status: string;
  hint: string | null;
}) {
  return (
    <div className={styles.loadMore}>
      <p className={styles.muted} aria-live="polite">
        {status}
      </p>
      {href && (
        <ButtonLink
          href={href}
          replace
          scroll={false}
          prefetch={false}
          onClick={() => {
            try {
              sessionStorage.setItem(FOCUS_KEY, next);
            } catch {
              // No storage: the focus stays on the button
            }
          }}
        >
          {label}
        </ButtonLink>
      )}
      {hint && <p className={styles.muted}>{hint}</p>}
    </div>
  );
}

/**
 * Once "Voir plus" has brought its cards, the first one takes the focus, so
 * that the keyboard and screen readers carry on from there. Rendered with the
 * grid whether or not more pages remain: the last one has no button.
 */
export function FocusBroughtCards({ shown }: { shown: number }) {
  useEffect(() => {
    try {
      const id = sessionStorage.getItem(FOCUS_KEY);
      const target = id && document.getElementById(id);
      if (target) {
        sessionStorage.removeItem(FOCUS_KEY);
        target.focus();
      }
    } catch {
      // No storage: nothing was asked
    }
  }, [shown]);
  return null;
}
