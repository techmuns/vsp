import { IndianRupee, Lock, Plus, Loader2 } from 'lucide-react';
import { MAIN_NAV, SETTINGS_NAV, type NavItem, type Page } from '../app/nav';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient shadow-sm">
        <IndianRupee size={19} strokeWidth={2.6} className="text-white" />
      </span>
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-[17px] font-extrabold text-ink">Kosh</div>
          <div className="text-[10.5px] font-medium text-grey">Personal finance</div>
        </div>
      )}
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition focus-ring ${
        active ? 'bg-brand/10 text-brand' : 'text-slate hover:bg-black/[0.035]'
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-brand-gradient" />}
      <Icon size={17} strokeWidth={2.2} style={{ color: active ? undefined : item.color }} className={active ? '' : 'opacity-80'} />
      <span>{item.label}</span>
      {!item.live && (
        <span className="ml-auto rounded-full bg-canvas px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted">soon</span>
      )}
    </button>
  );
}

export function Sidebar({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-white md:flex">
      <div className="px-4 py-4">
        <BrandMark />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {MAIN_NAV.map((item) => (
          <NavButton key={item.key} item={item} active={page === item.key} onClick={() => onNavigate(item.key)} />
        ))}
      </nav>
      <div className="space-y-1 border-t border-line px-3 py-3">
        <NavButton item={SETTINGS_NAV} active={page === 'settings'} onClick={() => onNavigate('settings')} />
        <p className="px-3 pt-1 text-[10px] text-muted">Phase 1 · Foundation</p>
      </div>
    </aside>
  );
}

export function MobileNav({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  const items = [...MAIN_NAV, SETTINGS_NAV];
  return (
    <nav className="nice-scroll sticky top-[57px] z-30 flex gap-1 overflow-x-auto border-b border-line bg-canvas/95 px-3 py-1.5 backdrop-blur md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active = page === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition ${
              active ? 'bg-brand/10 text-brand' : 'text-grey'
            }`}
          >
            <Icon size={15} strokeWidth={2.2} style={{ color: active ? undefined : item.color }} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export function TopBar({ onQuickAdd, children }: { onQuickAdd: () => void; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-md">
      <div className="flex h-[57px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="md:hidden">
            <BrandMark compact />
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-money-save/10 px-2.5 py-1 text-[11px] font-semibold text-money-save md:inline-flex">
            <Lock size={12} /> Private · on this device
          </span>
        </div>
        <div className="flex items-center gap-2">
          {children}
          <button
            onClick={onQuickAdd}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient px-3 py-2 text-[13px] font-bold text-white shadow-sm transition hover:opacity-95 focus-ring"
          >
            <Plus size={16} strokeWidth={2.8} />
            <span className="hidden sm:inline">Quick add</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function BootSplash() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas text-center">
      <div>
        <Loader2 className="mx-auto mb-3 animate-spin text-brand" size={30} />
        <p className="text-[13px] font-medium text-grey">Opening your private ledger…</p>
      </div>
    </div>
  );
}
