import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
  active?: boolean;
};

export function IconButton({ icon, label, active, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-aq-muted transition',
        'hover:border-aq-line hover:bg-white hover:text-aq-ink',
        active && 'border-aq-line bg-white text-aq-ink shadow-sm',
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
