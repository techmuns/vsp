import { useState } from 'react';
import type { AccountType, AssetType } from '../../db/types';
import { saveAccount, saveInvestment } from '../../db/repo';
import { Button, Segmented, TextField, type Option } from '../ui/Controls';

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

/** Inline "add investment" form used by the pickers. */
export function InvestmentCreateForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('stock');
  return (
    <div className="space-y-2">
      <TextField autoFocus value={name} placeholder="Investment name" onChange={(e) => setName(e.target.value)} />
      <TextField value={platform} placeholder="Platform / broker" onChange={(e) => setPlatform(e.target.value)} />
      <Segmented value={assetType} options={ASSET_TYPE_OPTS} onChange={setAssetType} size="sm" />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!name.trim()}
          onClick={async () => onDone((await saveInvestment({ name: name.trim(), platform: platform.trim() || 'Other', assetType })).id)}
          className="flex-1"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
