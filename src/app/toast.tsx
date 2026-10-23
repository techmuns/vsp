import { useEffect, useState } from 'react';
import { Check, Info, AlertTriangle, X } from 'lucide-react';

export type ToastTone = 'default' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

let items: Toast[] = [];
let seq = 0;
const listeners = new Set<(t: Toast[]) => void>();
const emit = () => listeners.forEach((l) => l(items));

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Fire a transient toast. Returns the toast id. */
export function toast(message: string, opts: { tone?: ToastTone; actionLabel?: string; onAction?: () => void; duration?: number } = {}): number {
  const id = ++seq;
  items = [...items, { id, message, tone: opts.tone ?? 'default', actionLabel: opts.actionLabel, onAction: opts.onAction }];
  emit();
  const ms = opts.duration ?? (opts.actionLabel ? 6000 : 3500);
  setTimeout(() => dismiss(id), ms);
  return id;
}

const TONE: Record<ToastTone, { icon: typeof Check; color: string }> = {
  default: { icon: Info, color: '#6366F1' },
  success: { icon: Check, color: '#10B981' },
  error: { icon: AlertTriangle, color: '#F43F5E' },
};

export function ToastHost() {
  const [list, setList] = useState<Toast[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  if (!list.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4">
      {list.map((t) => {
        const { icon: Icon, color } = TONE[t.tone];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 py-2.5 shadow-pop anim-fade"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${color}18`, color }}>
              <Icon size={15} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">{t.message}</span>
            {t.actionLabel && (
              <button
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-[12.5px] font-bold text-brand hover:bg-brand/10"
              >
                {t.actionLabel}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="shrink-0 text-muted hover:text-slate">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
