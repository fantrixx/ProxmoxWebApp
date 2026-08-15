import type {
  ApplianceInfo,
  AuthUser,
  BackupOverviewGuest,
  BackupStorage,
  GuestDetail,
  GuestIconRecord,
  IsoUsageEntry,
  MediaItem,
  MediaStorage,
  PowerSchedule,
  PveTask,
  ResourcesResponse,
  Snapshot,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type AppVersionInfo = {
  name: string;
  currentVersion: string;
  currentCommit: string | null;
  latestVersion: string | null;
  latestCommit: string | null;
  latestMessage: string | null;
  updateAvailable: boolean;
  updateCommand: string;
  repoUrl: string;
  checkedAt: number;
  error?: string;
  /** True when this host can run an in-app update (CT install). */
  canUpdate?: boolean;
};

export type UpdateStatus = {
  state: "idle" | "starting" | "running" | "success" | "rolled_back" | "failed";
  startedAt: number | null;
  finishedAt: number | null;
  triggeredBy: string | null;
  previousCommit?: string | null;
  rolledBack?: boolean;
  error?: string;
  logPath: string;
  canUpdate: boolean;
  log?: string;
};

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || res.statusText;
  } catch {
    return res.statusText || "Unknown error";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new ApiError(401, "Not signed in.");
  }
  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }
  return (await res.json()) as T;
}

export const authApi = {
  defaults: () =>
    api<{ host: string; username: string; realm: string; hasToken: boolean }>(
      "/api/auth/defaults",
    ),
  me: () => api<AuthUser>("/api/auth/me"),
  login: (body: Record<string, unknown>) =>
    api<AuthUser>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () => api<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};

export const metaApi = {
  version: (refresh = false) =>
    api<AppVersionInfo>(`/api/version${refresh ? "?refresh=1" : ""}`),
  updateStatus: () => api<UpdateStatus>("/api/update"),
  startUpdate: () =>
    api<UpdateStatus>("/api/update", {
      method: "POST",
    }),
};

export const dataApi = {
  resources: () => api<ResourcesResponse>("/api/resources"),
  guest: (node: string, type: string, vmid: string) =>
    api<GuestDetail>(
      `/api/guests/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(vmid)}`,
    ),
  action: (node: string, type: string, vmid: number | string, action: string) =>
    api<{ ok: boolean }>(
      `/api/guests/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(String(vmid))}/status/${encodeURIComponent(action)}`,
      { method: "POST" },
    ),
  snapshots: (node: string, type: string, vmid: string) =>
    api<{ snapshots: Snapshot[] }>(
      `/api/guests/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(vmid)}/snapshots`,
    ),
  createSnapshot: (
    node: string,
    type: string,
    vmid: string,
    body: { snapname: string; description?: string; vmstate?: boolean },
  ) =>
    api<{ ok: boolean }>(
      `/api/guests/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(vmid)}/snapshots`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  rollbackSnapshot: (node: string, type: string, vmid: string, snapname: string) =>
    api<{ ok: boolean }>(
      `/api/guests/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(vmid)}/snapshots/${encodeURIComponent(snapname)}/rollback`,
      { method: "POST" },
    ),
  deleteSnapshot: (node: string, type: string, vmid: string, snapname: string) =>
    api<{ ok: boolean }>(
      `/api/guests/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(vmid)}/snapshots/${encodeURIComponent(snapname)}`,
      { method: "DELETE" },
    ),
  updateResources: (
    node: string,
    type: string,
    vmid: string,
    body: {
      cores?: number;
      memory?: number;
      swap?: number;
      digest?: string;
      growGiB?: number;
    },
  ) =>
    api<{ ok: boolean }>(
      `/api/guests/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(vmid)}/resources`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  tasks: (limit?: number) =>
    api<{ tasks: PveTask[] }>(
      `/api/tasks${limit != null ? `?limit=${encodeURIComponent(String(limit))}` : ""}`,
    ),
  taskStatus: (node: string, upid: string) =>
    api<Record<string, unknown>>(
      `/api/task-status?node=${encodeURIComponent(node)}&upid=${encodeURIComponent(upid)}`,
    ),
  taskLog: (node: string, upid: string) =>
    api<{ log: { n?: number; t?: string }[] }>(
      `/api/task-log?node=${encodeURIComponent(node)}&upid=${encodeURIComponent(upid)}`,
    ),
  mediaIsos: () => api<{ items: MediaItem[] }>("/api/media/isos"),
  mediaTemplates: () => api<{ items: MediaItem[] }>("/api/media/templates"),
  mediaStorages: (content: "iso" | "vztmpl" | "images" | "rootdir") =>
    api<{ storages: MediaStorage[] }>(
      `/api/media/storages?content=${encodeURIComponent(content)}`,
    ),
  mediaIsoUsage: () =>
    api<{ usage: Record<string, IsoUsageEntry[]> }>("/api/media/iso-usage"),
  mediaDelete: (body: { node: string; storage: string; volume: string }) =>
    api<{ ok: boolean }>("/api/media", {
      method: "DELETE",
      body: JSON.stringify(body),
    }),
  mediaUpload: (body: {
    node: string;
    storage: string;
    content: "iso" | "vztmpl";
    file: File;
    filename?: string;
  }) => {
    const fd = new FormData();
    fd.append("node", body.node);
    fd.append("storage", body.storage);
    fd.append("content", body.content);
    fd.append("filename", body.filename || body.file.name);
    fd.append("file", body.file, body.filename || body.file.name);
    return api<{ ok: boolean; upid?: string }>("/api/media/upload", {
      method: "POST",
      body: fd,
    });
  },
  mediaDownloadUrl: (body: {
    node: string;
    storage: string;
    url: string;
    filename: string;
    content: "iso" | "vztmpl";
    checksum?: string;
    checksumAlgorithm?: string;
  }) =>
    api<{ ok: boolean; upid?: string }>("/api/media/download-url", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mediaAppliances: (node?: string) =>
    api<{ appliances: ApplianceInfo[]; node: string }>(
      `/api/media/appliances${node ? `?node=${encodeURIComponent(node)}` : ""}`,
    ),
  mediaDownloadAppliance: (body: { node: string; storage: string; template: string }) =>
    api<{ ok: boolean; upid?: string }>("/api/media/appliances/download", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  backupStorages: () => api<{ storages: BackupStorage[] }>("/api/media/backup-storages"),
  backupsOverview: () => api<{ guests: BackupOverviewGuest[] }>("/api/backups/overview"),
  storageContent: (node: string, storage: string, content?: string) =>
    api<{ content: MediaItem[] }>(
      `/api/storage/${encodeURIComponent(node)}/${encodeURIComponent(storage)}/content${
        content ? `?content=${encodeURIComponent(content)}` : ""
      }`,
    ),
  guestBackups: (node: string, type: string, vmid: string) =>
    api<{ backups: MediaItem[] }>(
      `/api/guests/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(vmid)}/backups`,
    ),
  startBackup: (
    node: string,
    type: string,
    vmid: string,
    body: {
      storage: string;
      mode?: "snapshot" | "suspend" | "stop";
      compress?: "zstd" | "gzip" | "lzo" | "none";
    },
  ) => {
    const compress = body.compress === "none" ? "0" : body.compress;
    // Flat route — avoids nested path issues and is easier to debug.
    return api<{ ok: boolean; upid?: string }>("/api/backup", {
      method: "POST",
      body: JSON.stringify({
        node,
        type,
        vmid,
        storage: body.storage,
        mode: body.mode,
        compress,
      }),
    });
  },
  restoreBackup: (body: {
    node: string;
    type: "lxc" | "qemu";
    vmid: number;
    archive: string;
    storage?: string;
    force?: boolean;
  }) =>
    api<{ ok: boolean; upid?: string }>("/api/backups/restore", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteBackup: (body: { node: string; storage: string; volume: string }) =>
    api<{ ok: boolean }>("/api/backups", {
      method: "DELETE",
      body: JSON.stringify(body),
    }),
  setCdrom: (node: string, vmid: string, body: { volid?: string | null; ide?: string }) =>
    api<{ ok: boolean; drive?: string; value?: string }>(
      `/api/guests/${encodeURIComponent(node)}/qemu/${encodeURIComponent(vmid)}/cdrom`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  nextId: () => api<{ nextid: number }>("/api/cluster/nextid"),
  nodeBridges: (node: string) =>
    api<{ bridges: { iface: string; active: boolean; comments?: string }[] }>(
      `/api/nodes/${encodeURIComponent(node)}/bridges`,
    ),
  createGuest: (body: {
    type: "lxc" | "qemu";
    node: string;
    vmid: number;
    name: string;
    cores: number;
    memory: number;
    diskGiB: number;
    storage: string;
    bridge: string;
    start?: boolean;
    ostemplate?: string;
    password?: string;
    swap?: number;
    unprivileged?: boolean;
    iso?: string | null;
  }) =>
    api<{ ok: boolean; upid?: string; type: "lxc" | "qemu"; node: string; vmid: number }>(
      "/api/guests",
      { method: "POST", body: JSON.stringify(body) },
    ),
  guestIcons: () => api<{ icons: Record<string, GuestIconRecord> }>("/api/guest-icons"),
  setGuestIcon: (
    node: string,
    type: string,
    vmid: string | number,
    body: { mode: GuestIconRecord["mode"]; slug?: string; file?: string },
  ) =>
    api<{ icon: GuestIconRecord }>(
      `/api/guest-icons/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(String(vmid))}`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  deleteGuestIcon: (node: string, type: string, vmid: string | number) =>
    api<{ ok: boolean }>(
      `/api/guest-icons/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(String(vmid))}`,
      { method: "DELETE" },
    ),
  uploadGuestIcon: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api<{ file: string; url: string }>("/api/guest-icons/upload", {
      method: "POST",
      body: fd,
    });
  },
  schedules: () =>
    api<{ schedules: PowerSchedule[]; automationReady: boolean }>(
      "/api/schedules",
    ),
  saveSchedule: (schedule: PowerSchedule) =>
    api<{ schedule: PowerSchedule }>("/api/schedules", {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),
  deleteSchedule: (id: string) =>
    api<{ ok: boolean }>(`/api/schedules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
