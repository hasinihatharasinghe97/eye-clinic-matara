import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type CardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** Optional heading shown at the top of the card. */
  title?: ReactNode;
  /** Optional controls shown to the right of the title. */
  actions?: ReactNode;
  children?: ReactNode;
};

/** A white panel that groups related content. */
export function Card({ title, actions, className, children, ...rest }: CardProps) {
  return (
    <section className={cx('card', className)} {...rest}>
      {(title || actions) && (
        <div className="card-header">
          {title && <h3>{title}</h3>}
          {actions && <div className="card-header-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
