import { dataApi } from "./api";
import {
  loadBackupPrefs,
  saveBackupPrefs,
  type BackupCompress,
  type BackupMode,
} from "./prefs";
import type { GuestType } from "./types";

export type QuickBackupOpts = {
  node: string;
  type: GuestType;
  vmid: string;
  name?: string;
  storage: string;
  mode: BackupMode;
  compress: BackupCompress;
};

function backupStorageOf(volid: string, storage?: string): string {
  if (storage) return storage;
  const idx = volid.indexOf(":");
  return idx > 0 ? volid.slice(0, idx) : volid;
}

/**
 * Resolve backup settings without opening the dialog when possible.
 * Returns null if the user must pick storage (open dialog).
 */
export async function resolveQuickBackup(
  node: string,
  type: GuestType,
  vmid: string,
): Promise<QuickBackupOpts | null> {
  const prefs = loadBackupPrefs();
  const mode: BackupMode = prefs.mode || "snapshot";
  const compress: BackupCompress = prefs.compress || "zstd";

  const [{ storages }, backupsRes] = await Promise.all([
    dataApi.backupStorages(),
    dataApi.guestBackups(node, type, vmid).catch(() => ({ backups: [] })),
  ]);

  const available = (storages || []).filter((s) => s.node === node || s.shared);
  const names = new Set(available.map((s) => s.storage));

  if (prefs.storage && names.has(prefs.storage)) {
    return {
      node,
      type,
      vmid,
      storage: prefs.storage,
      mode,
      compress,
    };
  }

  const last = [...(backupsRes.backups || [])].sort(
    (a, b) => (b.ctime || 0) - (a.ctime || 0),
  )[0];
  if (last) {
    const store = backupStorageOf(last.volid, last.storage);
    if (names.has(store)) {
      return { node, type, vmid, storage: store, mode, compress };
    }
  }

  if (available.length === 1) {
    return {
      node,
      type,
      vmid,
      storage: available[0].storage,
      mode,
      compress,
    };
  }

  return null;
}

export function rememberBackupSettings(opts: {
  storage: string;
  mode?: BackupMode;
  compress?: BackupCompress;
}) {
  saveBackupPrefs({
    storage: opts.storage,
    mode: opts.mode || "snapshot",
    compress: opts.compress || "zstd",
  });
}
