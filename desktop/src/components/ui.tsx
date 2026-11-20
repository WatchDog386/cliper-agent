import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ============================= Button ============================= */

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const buttonVariants: Record<ButtonVariant, string> = {
  default:
    'bg-accent text-white hover:bg-accent-strong shadow-sm active:scale-[0.98] disabled:hover:bg-accent',
  secondary: 'bg-surface-3 text-foreground-2 hover:bg-edge',
  outline:
    'border border-edge bg-surface text-foreground-2 hover:border-accent-border hover:bg-accent-soft hover:text-accent',
  ghost: 'text-foreground-3 hover:bg-surface-2 hover:text-foreground',
  destructive: 'bg-danger text-white hover:bg-danger-strong',
  success: 'bg-success text-white hover:bg-success-strong shadow-sm active:scale-[0.98]',
};

const buttonSizes: Record<ButtonSize, string> = {
  default: 'h-9 px-4 text-[13px]',
  sm: 'h-8 px-3 text-[12.5px]',
  lg: 'h-10 px-5 text-sm',
  icon: 'h-9 w-9',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/* ============================= Card ============================= */

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-md border border-edge bg-surface shadow-sm', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 border-b border-edge px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[14px] font-semibold text-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[12.5px] text-foreground-4', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

/* ============================= Badge ============================= */

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-accent-soft-2 text-accent-text',
  secondary: 'bg-surface-3 text-foreground-2',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  info: 'bg-info-soft text-info-text',
  outline: 'border border-edge text-foreground-3',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

/* ============================= Form ============================= */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-9 w-full rounded-md border border-edge bg-field px-3 text-[13px] text-foreground shadow-sm placeholder:text-foreground-5',
        'transition-colors duration-150 focus:border-edge-2 disabled:cursor-not-allowed disabled:bg-surface-2',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-md border border-edge bg-field px-3 py-2 text-[13px] text-foreground shadow-sm placeholder:text-foreground-5',
      'transition-colors duration-150 focus:border-edge-2 disabled:cursor-not-allowed disabled:bg-surface-2',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('mb-1.5 block text-[12.5px] font-medium text-foreground-2', className)}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 w-full appearance-none rounded-md border border-edge bg-field px-3 pr-8 text-[13px] text-foreground shadow-sm',
        'transition-colors duration-150 focus:border-edge-2 disabled:cursor-not-allowed disabled:bg-surface-2',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 rounded-md border border-edge bg-surface px-3.5 py-2.5 transition-colors',
        disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-surface-2',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-foreground">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11.5px] text-foreground-4">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-edge-2',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}

/* ============================= Segmented ============================= */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-md border border-edge bg-surface-2 p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'h-8 rounded px-3 text-[12.5px] font-medium transition-colors',
            value === option.value
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-foreground-4 hover:text-foreground-2',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ============================= Choice card ============================= */

export function Choice({
  active,
  onClick,
  title,
  hint,
  icon: Icon,
  className,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors',
        active
          ? 'border-accent-border bg-accent-soft'
          : 'border-edge bg-surface hover:border-edge-2 hover:bg-surface-2',
        className,
      )}
    >
      {Icon && (
        <Icon
          className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-accent' : 'text-foreground-4')}
          strokeWidth={1.75}
          aria-hidden
        />
      )}
      <span className="min-w-0">
        <span className={cn('block text-[13px] font-medium', active ? 'text-accent-text' : 'text-foreground')}>
          {title}
        </span>
        {hint && <span className="mt-0.5 block text-[11.5px] text-foreground-4">{hint}</span>}
      </span>
    </button>
  );
}

/* ============================= Stat card ============================= */

const statTones = {
  green: { card: 'bg-[#198754]', footer: 'bg-[#146C43] hover:bg-[#115C39]', icon: 'text-[#0A3D25]' },
  blue: { card: 'bg-[#0D6EFD]', footer: 'bg-[#0B5ED7] hover:bg-[#0A58CA]', icon: 'text-[#073B8C]' },
  yellow: { card: 'bg-[#FFC107]', footer: 'bg-[#E0A800] hover:bg-[#CC9A06]', icon: 'text-[#9C7400]' },
  red: { card: 'bg-[#DC3545]', footer: 'bg-[#B02A37] hover:bg-[#9A2530]', icon: 'text-[#7A1C26]' },
} as const;

export function StatCard({
  tone,
  icon: Icon,
  value,
  label,
  note,
  onClick,
}: {
  tone: keyof typeof statTones;
  icon: LucideIcon;
  value: string;
  label: string;
  note?: string;
  onClick?: () => void;
}) {
  const t = statTones[tone];
  const dark = tone === 'yellow';
  return (
    <div className={cn('overflow-hidden rounded-md shadow-sm', t.card, dark ? 'text-[#212529]' : 'text-white')}>
      <div className="relative min-h-[5.5rem] px-3.5 pb-3 pt-3">
        <p className="truncate pr-14 text-[22px] font-bold leading-tight tabular-nums tracking-tight">{value}</p>
        <p className="mt-1.5 truncate pr-14 text-[13px] font-semibold">{label}</p>
        {note && <p className="mt-0.5 truncate pr-14 text-[11.5px] opacity-80">{note}</p>}
        <Icon className={cn('absolute right-3 top-3 h-12 w-12 opacity-40', t.icon)} strokeWidth={1.5} aria-hidden />
      </div>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 py-1.5 text-[12.5px] font-medium transition-colors',
          t.footer,
        )}
      >
        More info
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}

/* ============================= Empty state ============================= */

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-edge bg-surface px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
        <Icon className="h-6 w-6 text-accent" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-[14px] font-medium text-foreground">{title}</p>
        {description && <p className="mx-auto max-w-sm text-[12.5px] text-foreground-4">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/* ============================= Misc ============================= */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-hidden
    />
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Alert({
  tone = 'danger',
  children,
  className,
}: {
  tone?: 'danger' | 'warning' | 'success' | 'info';
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    danger: 'border-danger-border bg-danger-soft text-danger-text',
    warning: 'border-warning-border bg-warning-soft text-warning-text',
    success: 'border-success-border bg-success-soft text-success-text',
    info: 'border-info-border bg-info-soft text-info-text',
  } as const;
  return (
    <div className={cn('rounded-md border px-3.5 py-2.5 text-[12.5px]', tones[tone], className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-normal tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-foreground-4">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'DONE':
      return 'success';
    case 'FAILED':
    case 'CANCELLED':
      return 'danger';
    case 'RENDERING':
      return 'info';
    case 'QUEUED':
    case 'FETCHING':
    case 'ANALYZING':
      return 'warning';
    default:
      return 'secondary';
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'QUEUED':
      return 'Queued';
    case 'FETCHING':
      return 'Downloading';
    case 'ANALYZING':
      return 'Analyzing';
    case 'RENDERING':
      return 'Rendering';
    case 'DONE':
      return 'Ready';
    case 'FAILED':
      return 'Failed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}
