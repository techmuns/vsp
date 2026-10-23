import { useEffect, useRef, useState } from 'react';
import { Bell, X, Check, Settings as SettingsIcon } from 'lucide-react';
import type { KoshNotification, NotifSeverity } from '../engine';
import type { Page } from '../app/nav';
import { MONEY } from '../lib/brand';

const SEV_COLOR: Record<NotifSeverity, string> = {
  alert: MONEY.out,
  warn: MONEY.receivable,
  info: MONEY.net,
};

/** In-dashboard notification centre — quiet, read-only, never pushed off-device. */
export function NotificationBell({
  items,
  onNavigate,
  onDismiss,
}: {
  items: KoshNotification[];
  onNavigate: (page: Page) => void;
  onDismiss: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const alerts = items.filter((n) => n.severity === 'alert' || n.severity === 'warn').length;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-slate shadow-sm transition hover:border-brand/40 hover:text-ink focus-ring"
      >
        <Bell size={17} strokeWidth={2.2} />
        {items.length > 0 && (
          <span
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: alerts > 0 ? MONEY.out : MONEY.net }}
          >
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[330px] max-w-[88vw] overflow-hidden rounded-2xl border border-line bg-white shadow-pop anim-fade">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <span className="font-display text-[13.5px] font-bold text-ink">Notifications</span>
            <span className="text-[11px] text-grey">{items.length} active</span>
          </div>

          {items.length === 0 ? (
            <div className="grid place-items-center px-4 py-10 text-center">
              <span className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-money-save/12 text-money-save">
                <Check size={20} />
              </span>
              <p className="text-[13px] font-semibold text-ink">You're all caught up</p>
              <p className="mt-0.5 text-[11.5px] text-grey">Bills, dues and reminders will show up here.</p>
            </div>
          ) : (
            <div className="nice-scroll max-h-[60vh] overflow-y-auto py-1">
              {items.map((n) => (
                <div key={n.id} className="group flex items-start gap-2.5 px-3.5 py-2.5 transition hover:bg-canvas">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: SEV_COLOR[n.severity] }} />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (n.target) onNavigate(n.target as Page);
                      setOpen(false);
                    }}
                  >
                    <div className="text-[12.5px] font-semibold leading-snug text-ink">{n.title}</div>
                    <div className="mt-0.5 text-[11.5px] leading-snug text-grey">{n.hint}</div>
                  </button>
                  <button
                    onClick={() => onDismiss(n.id)}
                    title="Dismiss"
                    className="shrink-0 rounded-lg p-1 text-muted opacity-0 transition hover:bg-black/5 hover:text-money-out group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              onNavigate('settings');
              setOpen(false);
            }}
            className="flex w-full items-center gap-1.5 border-t border-line px-3.5 py-2.5 text-[11.5px] font-semibold text-slate transition hover:bg-canvas"
          >
            <SettingsIcon size={13} /> Notification settings
          </button>
        </div>
      )}
    </div>
  );
}
