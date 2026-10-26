import { exportBackup, updateSettings } from '../db/repo';
import { todayISO } from '../db/ids';

/** Build the full backup and save it to the browser's Downloads as one JSON file. */
export async function downloadBackup(): Promise<void> {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kosh-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await updateSettings({ lastBackupAt: Date.now() });
}

export const AUTO_BACKUP_INTERVAL_MS = 7 * 864e5; // 7 days
