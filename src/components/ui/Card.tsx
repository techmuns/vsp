import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BRAND } from '../../lib/brand';

/** The one page-level header — a consistent opener for every page:
 *  title + subtitle on the left, optional controls on the right. */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  right,
  accent = BRAND.indigo,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-[19px] font-extrabold leading-tight text-ink sm:text-[22px]">
          {Icon && <Icon size={20} strokeWidth={2.3} className="shrink-0" style={{ color: accent }} />}
          <span className="truncate">{title}</span>
        </h2>
        {subtitle && <p className="mt-1 max-w-3xl text-[13px] leading-snug text-grey">{subtitle}</p>}
      </div>
      {right && <div className="flex min-w-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Card({
  children,
  className = '',
  pad = true,
  onClick,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  onClick?: () => void;
  hover?: boolean;
}) {
  return (
    <section
      onClick={onClick}
      className={`min-w-0 rounded-2xl border border-line bg-white shadow-card ${pad ? 'p-4 sm:p-5' : ''} ${
        hover ? 'transition hover:shadow-card-hover' : ''
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  right,
  accent = BRAND.indigo,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={{ background: `${accent}16`, color: accent }}
          >
            <Icon size={17} strokeWidth={2.2} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-bold leading-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-grey">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Badge({
  children,
  color = '#64748B',
  soft = true,
  className = '',
}: {
  children: ReactNode;
  color?: string;
  soft?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${className}`}
      style={soft ? { background: `${color}1A`, color } : { background: color, color: '#fff' }}
    >
      {children}
    </span>
  );
}

export function Pill({
  children,
  className = '',
  color = '#334155',
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${className}`}
      style={{ borderColor: `${color}33`, color }}
    >
      {children}
    </span>
  );
}

/** A compact inline stat used sparingly (not a KPI wall). */
export function MiniStat({
  label,
  value,
  sub,
  color = '#0F172A',
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-line bg-white px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-grey">
        {Icon && <Icon size={13} style={{ color }} />}
        {label}
      </div>
      <div className="tnum mt-1 font-display text-[20px] font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11.5px] leading-snug text-grey">{sub}</div>}
    </div>
  );
}

/** Light section label above a group of cards. */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 mt-1 flex items-center justify-between gap-2">
      <h3 className="text-[12px] font-bold uppercase tracking-wider text-grey">{children}</h3>
      {right}
    </div>
  );
}

/** Friendly empty state — never a fake number. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  accent = BRAND.indigo,
  compact = false,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  accent?: string;
  compact?: boolean;
}) {
  return (
    <div className={`grid place-items-center text-center ${compact ? 'py-7' : 'py-12'}`}>
      {Icon && (
        <span
          className="mb-3 grid h-12 w-12 place-items-center rounded-2xl"
          style={{ background: `${accent}14`, color: accent }}
        >
          <Icon size={22} strokeWidth={2.1} />
        </span>
      )}
      <p className="font-display text-[14.5px] font-bold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[12.5px] leading-snug text-grey">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
