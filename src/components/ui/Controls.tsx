import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
  type ButtonHTMLAttributes,
} from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BRAND } from '../../lib/brand';

export interface Option<T extends string = string> {
  value: T;
  label: string;
  color?: string;
  hint?: string;
}

/** Styled custom dropdown. */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  width,
  placeholder = 'Select',
  size = 'md',
}: {
  value: T | '';
  options: Option<T>[];
  onChange: (v: T) => void;
  label?: string;
  width?: number | string;
  placeholder?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-3 py-2 text-[13px]';

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref} style={{ width }}>
      {label && <span className="mb-1 block text-[11.5px] font-medium text-grey">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-white font-semibold text-ink shadow-sm transition hover:border-brand/40 hover:shadow focus-ring ${pad}`}
      >
        <span className="flex items-center gap-2 truncate">
          {current?.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: current.color }} />}
          <span className={`truncate ${current ? '' : 'text-muted'}`}>{current?.label ?? placeholder}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-grey transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="nice-scroll absolute z-50 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-pop anim-fade">
          {options.length === 0 && <div className="px-3 py-2 text-[12.5px] text-muted">No options yet</div>}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-canvas ${
                o.value === value ? 'font-bold text-brand' : 'font-medium text-slate'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                {o.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: o.color }} />}
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="text-[11px] font-normal text-muted">· {o.hint}</span>}
              </span>
              {o.value === value && <Check size={15} className="shrink-0 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-select dropdown with checkboxes — for filter bars. */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  width = 160,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (v: string[]) => void;
  width?: number | string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="relative" ref={ref} style={{ width }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-2.5 py-1.5 text-[12.5px] font-semibold shadow-sm transition hover:border-brand/40 focus-ring ${
          selected.length ? 'border-brand/40 text-brand' : 'border-line text-slate'
        }`}
      >
        <span className="truncate">
          {label}
          {selected.length > 0 && <span className="ml-1 tnum">· {selected.length}</span>}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-grey transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="nice-scroll absolute z-50 mt-1.5 max-h-72 min-w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-pop anim-fade" style={{ width: 'max-content', maxWidth: 260 }}>
          {options.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">None yet</div>}
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition hover:bg-canvas"
              >
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-brand bg-brand text-white' : 'border-line'}`}>
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                {o.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: o.color }} />}
                <span className="truncate text-slate">{o.label}</span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full border-t border-line px-3 py-1.5 text-left text-[12px] font-semibold text-money-out hover:bg-canvas">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Segmented toggle. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  activeColor = BRAND.indigo,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  activeColor?: string;
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3.5 py-1.5 text-[12.5px]';
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-line bg-canvas p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-lg font-semibold transition ${pad} ${
              active ? 'bg-white shadow-sm' : 'text-grey hover:text-slate'
            }`}
            style={active ? { color: o.color ?? activeColor } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch. */
export function Toggle({
  checked,
  onChange,
  label,
  color = BRAND.indigo,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  color?: string;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 focus-ring">
      <span className="relative h-5 w-9 rounded-full transition" style={{ background: checked ? color : '#CBD5E1' }}>
        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: checked ? 18 : 2 }} />
      </span>
      {label && <span className="text-[12.5px] font-medium text-slate">{label}</span>}
    </button>
  );
}

type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'outline';
export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  children,
  className = '',
  ...rest
}: {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  iconRight?: LucideIcon;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = {
    sm: 'px-2.5 py-1.5 text-[12px] gap-1.5',
    md: 'px-3.5 py-2 text-[13px] gap-2',
    lg: 'px-4 py-2.5 text-[14px] gap-2',
  }[size];
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-brand-gradient text-white shadow-sm hover:opacity-95',
    soft: 'bg-brand/10 text-brand hover:bg-brand/15',
    outline: 'border border-line bg-white text-slate hover:border-brand/40 hover:text-ink',
    ghost: 'text-slate hover:bg-black/[0.04]',
    danger: 'bg-money-out/10 text-money-out hover:bg-money-out/15',
  };
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${variants[variant]} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={size === 'lg' ? 18 : 16} strokeWidth={2.3} />}
      {children}
      {IconRight && <IconRight size={size === 'lg' ? 18 : 16} strokeWidth={2.3} />}
    </button>
  );
}

export function Field({ label, hint, children, required }: { label: ReactNode; hint?: ReactNode; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11.5px] font-semibold text-slate">
        {label}
        {required && <span className="text-money-out">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-xl border border-line bg-white px-3 py-2 text-[13.5px] text-ink shadow-sm outline-none transition placeholder:text-muted focus:border-brand/50 focus:ring-2 focus:ring-brand/15';

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputBase} {...props} />;
}

export function DateField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" className={`${inputBase} tnum`} {...props} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputBase} min-h-[64px] resize-y`} {...props} />;
}

/** A rupee amount field. Value & onChange speak PAISE; the user types rupees. */
export function AmountField({
  paise,
  onPaise,
  autoFocus,
  placeholder = '0',
  big = false,
}: {
  paise: number | null;
  onPaise: (p: number | null) => void;
  autoFocus?: boolean;
  placeholder?: string;
  big?: boolean;
}) {
  // Keep the raw text so the user can type "43." or "1250.5" freely.
  const [raw, setRaw] = useState(paise == null ? '' : String(paise / 100));
  useEffect(() => {
    const asNum = raw === '' ? null : Math.round(parseFloat(raw) * 100);
    // only sync down when external paise differs from what our text represents
    if ((paise ?? null) !== (isFinite(asNum as number) ? asNum : null)) {
      setRaw(paise == null ? '' : String(paise / 100));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paise]);

  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-grey ${
          big ? 'text-[22px]' : 'text-[14px]'
        }`}
      >
        ₹
      </span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={raw}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9.]/g, '');
          setRaw(t);
          if (t === '' || t === '.') return onPaise(null);
          const n = parseFloat(t);
          onPaise(isFinite(n) ? Math.round(n * 100) : null);
        }}
        className={`tnum w-full rounded-xl border border-line bg-white py-2 pr-3 font-bold text-ink shadow-sm outline-none transition placeholder:font-normal placeholder:text-muted focus:border-brand/50 focus:ring-2 focus:ring-brand/15 ${
          big ? 'pl-8 text-[22px]' : 'pl-7 text-[14px]'
        }`}
      />
    </div>
  );
}
