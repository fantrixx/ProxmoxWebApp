import type { AuthUser, GuestDetail, ResourcesResponse, Snapshot } from "./types";

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
  latestCommit: string | null;
  latestMessage: string | null;
  updateAvailable: boolean;
  updateCommand: string;
  repoUrl: string;
  checkedAt: number;
  error?: string;
};

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || res.statusText;
  } catch {
    return res.statusText || "Unbekannter Fehler";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
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
    throw new ApiError(401, "Nicht angemeldet.");
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
};
