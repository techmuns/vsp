import { useState } from 'react';
import { Check } from 'lucide-react';
import type { AccountType, AssetType } from '../../db/types';
import { saveAccount, saveInvestment } from '../../db/repo';
import { Button, Segmented, TextField, type Option } from '../ui/Controls';
import { InstrumentSearch } from './InstrumentSearch';
import type { InstrumentHit } from '../../app/directory';

export const ACCOUNT_TYPE_OPTS: Option<AccountType>[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'broker_cash', label: 'Broker' },
];

export const ASSET_TYPE_OPTS: Option<AssetType>[] = [
  { value: 'stock', label: 'Stock' },
  { value: 'mutual_fund', label: 'Mutual fund' },
  { value: 'etf', label: 'ETF' },
  { value: 'other', label: 'Other' },
];

/** Inline "add account" form used by the pickers. */
export function AccountCreateForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  return (
    <div className="space-y-2">
      <TextField autoFocus value={name} placeholder="Account name" onChange={(e) => setName(e.target.value)} />
      <Segmented value={type} options={ACCOUNT_TYPE_OPTS} onChange={setType} size="sm" />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button size="sm" disabled={!name.trim()} onClick={async () => onDone((await saveAccount({ name: name.trim(), type })).id)} className="flex-1">
          Add account
        </Button>
      </div>
    </div>
  );
}

/** Inline "add investment" form — search a fund/stock by name (so the ISIN /
 *  ticker is set for you), with a manual fallback. */
export function InvestmentCreateForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [assetType, setAssetType] = useState<AssetType>('mutual_fund');
  const [picked, setPicked] = useState<InstrumentHit | null>(null);
  const [manual, setManual] = useState(false);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');
  const [symbol, setSymbol] = useState('');
  const [isin, setIsin] = useState('');

  const isMF = assetType === 'mutual_fund';
  const searchable = assetType === 'mutual_fund' || assetType === 'stock' || assetType === 'etf';
  const kind: 'fund' | 'stock' = isMF ? 'fund' : 'stock';

  const resetPick = () => {
    setPicked(null);
    setName('');
    setIsin('');
    setSymbol('');
  };
  const changeAsset = (v: AssetType) => {
    setAssetType(v);
    setManual(false);
    resetPick();
  };
  const onPick = (h: InstrumentHit) => {
    setPicked(h);
    setName(h.name);
    if (h.kind === 'fund') {
      setIsin(h.id);
      setSymbol('');
    } else {
      setSymbol(h.id);
      setIsin('');
    }
  };

  return (
    <div className="space-y-2">
      <Segmented value={assetType} options={ASSET_TYPE_OPTS} onChange={changeAsset} size="sm" />

      {searchable && !manual && !picked && (
        <>
          <InstrumentSearch kind={kind} onPick={onPick} autoFocus />
          <button type="button" onClick={() => setManual(true)} className="px-0.5 text-[11px] font-medium text-brand hover:underline">
            Can't find it? Enter manually
          </button>
        </>
      )}

      {picked && (
        <div className="flex items-start gap-2 rounded-xl border border-money-save/30 bg-money-save/[0.06] px-2.5 py-2">
          <Check size={15} className="mt-0.5 shrink-0 text-money-save" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink">{picked.name}</div>
            <div className="text-[10.5px] text-grey">{picked.kind === 'fund' ? `${picked.id} · live daily NAV` : `${picked.id.replace('.NS', '')} · NSE · live price`}</div>
          </div>
          <button type="button" onClick={resetPick} className="shrink-0 text-[11px] font-medium text-brand hover:underline">
            Change
          </button>
        </div>
      )}

      {(manual || !searchable) && !picked && (
        <>
          <TextField autoFocus value={name} placeholder="Investment name" onChange={(e) => setName(e.target.value)} />
          {searchable &&
            (isMF ? (
              <TextField value={isin} placeholder="ISIN — optional, for live NAV (INF…)" onChange={(e) => setIsin(e.target.value)} />
            ) : (
              <TextField value={symbol} placeholder="Ticker — optional, e.g. RELIANCE.NS" onChange={(e) => setSymbol(e.target.value)} />
            ))}
          {searchable && (
            <button type="button" onClick={() => { setManual(false); resetPick(); }} className="px-0.5 text-[11px] font-medium text-brand hover:underline">
              ← Search by name instead
            </button>
          )}
        </>
      )}

      <TextField value={platform} placeholder="Platform / broker (optional, e.g. Zerodha)" onChange={(e) => setPlatform(e.target.value)} />

      <div className="flex gap-2 pt-0.5">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!name.trim()}
          onClick={async () =>
            onDone(
              (
                await saveInvestment({
                  name: name.trim(),
                  platform: platform.trim() || 'Other',
                  assetType,
                  symbol: !isMF ? symbol.trim().toUpperCase() || undefined : undefined,
                  isin: isMF ? isin.trim().toUpperCase() || undefined : undefined,
                })
              ).id
            )
          }
          className="flex-1"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
