import { useState, type ReactNode } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { Dropdown, type Option } from '../ui/Controls';

export interface CreateFormProps {
  onDone: (id: string) => void;
  onCancel: () => void;
}

/** A dropdown that can create a new option inline (the "+" button). */
export function CreatableSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  onCreate,
  createNoun,
  renderCreateForm,
  size = 'sm',
}: {
  value: T | '';
  onChange: (v: T) => void;
  options: Option<T>[];
  placeholder?: string;
  onCreate?: (name: string) => Promise<string>;
  createNoun: string;
  renderCreateForm?: (props: CreateFormProps) => ReactNode;
  size?: 'sm' | 'md';
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const done = (id: string) => {
    setCreating(false);
    setName('');
    onChange(id as T);
  };

  if (creating) {
    if (renderCreateForm) {
      return <div className="rounded-xl border border-brand/30 bg-brand/[0.04] p-2.5">{renderCreateForm({ onDone: done, onCancel: () => setCreating(false) })}</div>;
    }
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={name}
          placeholder={`New ${createNoun} name`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && name.trim() && onCreate && !busy) {
              setBusy(true);
              try {
                done(await onCreate(name.trim()));
              } finally {
                setBusy(false);
              }
            }
            if (e.key === 'Escape') setCreating(false);
          }}
          className="w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
        />
        <button
          type="button"
          disabled={!name.trim() || busy}
          onClick={async () => {
            if (onCreate && name.trim()) {
              setBusy(true);
              try {
                done(await onCreate(name.trim()));
              } finally {
                setBusy(false);
              }
            }
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-white disabled:opacity-40"
        >
          <Check size={16} />
        </button>
        <button type="button" onClick={() => setCreating(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-grey">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <Dropdown value={value} options={options} onChange={onChange} placeholder={placeholder} size={size} width="100%" />
      </div>
      <button
        type="button"
        onClick={() => setCreating(true)}
        title={`Add ${createNoun}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-brand transition hover:border-brand/40 hover:bg-brand/5 focus-ring"
      >
        <Plus size={16} strokeWidth={2.6} />
      </button>
    </div>
  );
}
