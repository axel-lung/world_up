import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import styles from './Button.module.css';

// Outlined, never filled (Nocturne .btn). "danger" is the secondary button in
// the danger color, e.g. "Supprimer le compte".
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonStyleProps {
  variant?: Variant;
  icon?: ReactNode;
  /** Square 44 px button: give it an aria-label. */
  iconOnly?: boolean;
  block?: boolean;
}

function buttonClassName({ variant = 'secondary', iconOnly, block }: ButtonStyleProps, className?: string) {
  return [
    'btn',
    variant === 'danger' ? 'btn-secondary' : `btn-${variant}`,
    styles.button,
    styles[variant],
    iconOnly && `btn-icon ${styles.iconOnly}`,
    block && styles.block,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant,
  icon,
  iconOnly,
  block,
  className,
  children,
  type = 'button',
  ...props
}: ButtonStyleProps & ComponentProps<'button'>) {
  return (
    <button type={type} className={buttonClassName({ variant, iconOnly, block }, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  icon,
  iconOnly,
  block,
  className,
  children,
  ...props
}: ButtonStyleProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClassName({ variant, iconOnly, block }, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
