/** Persistent UI prefs (localStorage) to skip repeated form choices. */

export type BackupMode = "snapshot" | "suspend" | "stop";
export type BackupCompress = "zstd" | "gzip" | "lzo" | "none";

export type BackupPrefs = {
  storage?: string;
  mode?: BackupMode;
  compress?: BackupCompress;
};

export type UploadPrefs = {
  isoStorageKey?: string;
  templateStorageKey?: string;
};

export type CreatePrefs = {
  node?: string;
  storageKey?: string;
  bridge?: string;
  cores?: string;
  memory?: string;
  diskGiB?: string;
};

const BACKUP_KEY = "proxpanel.prefs.backup";
const UPLOAD_KEY = "proxpanel.prefs.upload";
const CREATE_KEY = "proxpanel.prefs.create";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadBackupPrefs(): BackupPrefs {
  return readJson<BackupPrefs>(BACKUP_KEY) || {};
}

export function saveBackupPrefs(patch: BackupPrefs) {
  writeJson(BACKUP_KEY, { ...loadBackupPrefs(), ...patch });
}

export function loadUploadPrefs(): UploadPrefs {
  return readJson<UploadPrefs>(UPLOAD_KEY) || {};
}

export function saveUploadPrefs(patch: UploadPrefs) {
  writeJson(UPLOAD_KEY, { ...loadUploadPrefs(), ...patch });
}

export function loadCreatePrefs(): CreatePrefs {
  return readJson<CreatePrefs>(CREATE_KEY) || {};
}

export function saveCreatePrefs(patch: CreatePrefs) {
  writeJson(CREATE_KEY, { ...loadCreatePrefs(), ...patch });
}
