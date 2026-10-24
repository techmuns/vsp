import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, TextField } from '../components/ui/Controls';

// In-app confirm / prompt dialogs. Native window.confirm()/prompt() are
// silently suppressed in sandboxed iframes and many embedded webviews (they
// just return false/null), which would make destructive actions no-op. These
// replacements are plain DOM and always work. Imperative API, mirroring toast.

interface DialogReq {
  id: number;
  kind: 'confirm' | 'prompt';
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  placeholder?: string;
  defaultValue?: string;
  resolve: (v: boolean | string | null) => void;
}

let current: DialogReq | null = null;
let seq = 0;
const listeners = new Set<(r: DialogReq | null) => void>();
const emit = () => listeners.forEach((l) => l(current));

/** Ask the user to confirm an action. Resolves true only if they confirm. */
export function askConfirm(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    current = { id: ++seq, kind: 'confirm', ...opts, resolve: (v) => resolve(v === true) };
    emit();
  });
}

/** Ask the user for a short text value. Resolves the text, or null if cancelled. */
export function askPrompt(opts: {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    current = { id: ++seq, kind: 'prompt', ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) };
    emit();
  });
}

function settle(req: DialogReq, value: boolean | string | null) {
  req.resolve(value);
  if (current && current.id === req.id) {
    current = null;
    emit();
  }
}

export function ConfirmHost() {
  const [req, setReq] = useState<DialogReq | null>(current);
  const [text, setText] = useState('');

  useEffect(() => {
    const l = (r: DialogReq | null) => {
      setReq(r);
      if (r?.kind === 'prompt') setText(r.defaultValue ?? '');
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(req, req.kind === 'prompt' ? null : false);
      else if (e.key === 'Enter' && req.kind === 'prompt') settle(req, text);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req, text]);

  if (!req) return null;
  const cancel = () => settle(req, req.kind === 'prompt' ? null : false);
  const accept = () => settle(req, req.kind === 'prompt' ? text : true);

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm anim-fade" onClick={cancel} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-pop animate-fade-up">
        <div className="px-5 py-4">
          <div className="flex items-start gap-3">
            {req.danger && (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-money-out/12 text-money-out">
                <AlertTriangle size={18} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[15px] font-bold leading-tight text-ink">{req.title}</h3>
              {req.message && <p className="mt-1 text-[12.5px] leading-snug text-grey">{req.message}</p>}
              {req.kind === 'prompt' && (
                <div className="mt-3">
                  <TextField autoFocus value={text} placeholder={req.placeholder} onChange={(e) => setText(e.target.value)} />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-canvas/50 px-5 py-3">
          <Button variant="outline" size="sm" onClick={cancel}>{req.cancelLabel ?? 'Cancel'}</Button>
          <Button
            variant={req.danger ? 'danger' : 'primary'}
            size="sm"
            disabled={req.kind === 'prompt' && !text.trim()}
            onClick={accept}
          >
            {req.confirmLabel ?? (req.kind === 'prompt' ? 'Save' : 'Confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
