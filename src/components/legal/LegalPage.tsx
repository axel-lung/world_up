import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './LegalPage.module.css';

type Tag = (chunks: ReactNode) => ReactNode;

const internal = (href: string): Tag =>
  function InternalLink(chunks) {
    return <Link href={href}>{chunks}</Link>;
  };

/**
 * The markup the legal texts of messages/fr.json use: paragraphs, lists, links
 * to the site's pages, and <mail> for the publisher's address.
 */
export function legalTags(email: string | null) {
  return {
    p: (chunks: ReactNode) => <p>{chunks}</p>,
    ul: (chunks: ReactNode) => <ul>{chunks}</ul>,
    li: (chunks: ReactNode) => <li>{chunks}</li>,
    mail: (chunks: ReactNode) => (email ? <a href={`mailto:${email}`}>{chunks}</a> : chunks),
    legal: internal('/legal-notice'),
    terms: internal('/terms'),
    privacy: internal('/privacy'),
    rules: internal('/rules'),
    odds: internal('/odds'),
    credits: internal('/credits'),
    account: internal('/account'),
    leaderboard: internal('/leaderboard'),
    cnil: (chunks: ReactNode) => (
      <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">
        {chunks}
      </a>
    ),
  };
}

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Legal notice, terms of use, privacy policy: a title, its date, then the sections. */
export function LegalPage({
  title,
  meta,
  sections,
}: {
  title: string;
  /** Version or update date, under the title. */
  meta?: string;
  sections: LegalSection[];
}) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{title}</h1>
        {meta && <p className={styles.meta}>{meta}</p>}
      </header>
      {sections.map((section) => (
        <section key={section.id} className={styles.section} aria-labelledby={`${section.id}-heading`}>
          <h2 id={`${section.id}-heading`}>{section.title}</h2>
          {section.body}
        </section>
      ))}
    </main>
  );
}
