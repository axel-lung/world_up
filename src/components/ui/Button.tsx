import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Button.module.css';

// Organic's pill .btn, in Caprasimo. primary: the terracotta fill. sage: the
// second voice (exchanges). danger: the secondary button in the danger color,
// e.g. "Supprimer le compte".
type Variant = 'primary' | 'secondary' | 'ghost' | 'sage' | 'danger';

interface ButtonStyleProps {
  variant?: Variant;
  /** large: the page's main action, e.g. "Ouvrir un paquet". */
  size?: 'medium' | 'large';
  icon?: ReactNode;
  /** Round 44 px button: give it an aria-label. */
  iconOnly?: boolean;
  block?: boolean;
}

const ORGANIC_CLASS: Record<Variant, string | null> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  sage: null,
  danger: 'btn-secondary',
};

function buttonClassName({ variant = 'secondary', size = 'medium', iconOnly, block }: ButtonStyleProps, className?: string) {
  return [
    'btn',
    ORGANIC_CLASS[variant],
    styles.button,
    styles[variant],
    size === 'large' && styles.large,
    iconOnly && `btn-icon ${styles.iconOnly}`,
    block && styles.block,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant,
  size,
  icon,
  iconOnly,
  block,
  className,
  children,
  type = 'button',
  ...props
}: ButtonStyleProps & ComponentProps<'button'>) {
  return (
    <button type={type} className={buttonClassName({ variant, size, iconOnly, block }, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  icon,
  iconOnly,
  block,
  className,
  children,
  ...props
}: ButtonStyleProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClassName({ variant, size, iconOnly, block }, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
