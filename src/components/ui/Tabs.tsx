import type { LucideIcon } from 'lucide-react';

export interface TabDef<T extends string = string> {
  key: T;
  label: string;
  icon?: LucideIcon;
  badge?: string;
  soon?: boolean;
}

/** Primary navigation tabs (icon + label) with a gradient active underline. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="nice-scroll flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t.key === active;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`group relative flex shrink-0 items-center gap-2 rounded-t-xl px-3.5 py-2.5 text-[13px] font-semibold transition ${
              isActive ? 'text-brand' : 'text-grey hover:text-slate'
            }`}
          >
            {Icon && <Icon size={16} strokeWidth={2.3} className={isActive ? '' : 'opacity-70'} />}
            <span className="whitespace-nowrap">{t.label}</span>
            {t.soon && (
              <span className="rounded-full bg-money-recv/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-money-recv">
                soon
              </span>
            )}
            {t.badge && (
              <span className="tnum rounded-full bg-brand/12 px-1.5 py-0.5 text-[10px] font-bold text-brand">{t.badge}</span>
            )}
            <span
              className={`absolute inset-x-2 bottom-0 h-[3px] rounded-full transition-all ${
                isActive ? 'bg-brand-gradient opacity-100' : 'opacity-0 group-hover:bg-line group-hover:opacity-100'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Lightweight sub-tabs / chips. */
export function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; color?: string }[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
              isActive ? 'border-transparent text-white shadow-sm' : 'border-line bg-white text-slate hover:border-brand/40'
            }`}
            style={isActive ? { background: t.color ?? '#6366F1' } : undefined}
          >
            {t.color && <span className="h-2 w-2 rounded-sm" style={{ background: isActive ? '#ffffff' : t.color }} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
