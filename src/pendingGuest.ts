const KEY = "proxpanel.pendingGuestState";
const TTL_MS = 3 * 60 * 1000;

export type PendingGuestAction = "shutting down" | "stopping" | "starting" | "rebooting";

type Entry = {
  state: PendingGuestAction;
  until: number;
};

type Store = Record<string, Entry>;

function read(): Store {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const next: Store = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && v.until > now) next[k] = v;
    }
    return next;
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function guestPendingKey(node: string, type: string, vmid: number | string): string {
  return `${node}:${type}:${vmid}`;
}

export function setPendingGuestAction(
  node: string,
  type: string,
  vmid: number | string,
  action: string,
): void {
  const state: PendingGuestAction | null =
    action === "shutdown"
      ? "shutting down"
      : action === "stop"
        ? "stopping"
        : action === "start"
          ? "starting"
          : action === "reboot"
            ? "rebooting"
            : null;
  if (!state) return;
  const store = read();
  store[guestPendingKey(node, type, vmid)] = {
    state,
    until: Date.now() + TTL_MS,
  };
  write(store);
}

export function clearPendingGuestAction(
  node: string,
  type: string,
  vmid: number | string,
): void {
  const store = read();
  const key = guestPendingKey(node, type, vmid);
  if (!(key in store)) return;
  delete store[key];
  write(store);
}

export function getPendingGuestAction(
  node: string | undefined,
  type: string,
  vmid: number | string | undefined,
): PendingGuestAction | undefined {
  if (!node || vmid == null) return undefined;
  const entry = read()[guestPendingKey(node, type, vmid)];
  if (!entry) return undefined;
  if (entry.until <= Date.now()) {
    clearPendingGuestAction(node, type, vmid);
    return undefined;
  }
  return entry.state;
}

/** Drop pending markers once Proxmox status caught up. */
export function reconcilePendingGuestAction(
  node: string | undefined,
  type: string,
  vmid: number | string | undefined,
  status: string | undefined,
  qmpstatus?: string | undefined,
): PendingGuestAction | undefined {
  const pending = getPendingGuestAction(node, type, vmid);
  if (!pending || !node || vmid == null) return pending;

  const s = (status || "").toLowerCase();
  const q = (qmpstatus || "").toLowerCase();

  if (pending === "shutting down" || pending === "stopping") {
    if (s === "stopped" || q === "shutdown") {
      // keep "shutting down" while qmp says shutdown; clear when fully stopped
      if (s === "stopped") {
        clearPendingGuestAction(node, type, vmid);
        return undefined;
      }
    }
  }
  if (pending === "starting" && s === "running" && q !== "prelaunch") {
    clearPendingGuestAction(node, type, vmid);
    return undefined;
  }
  if (pending === "rebooting" && s === "running" && q !== "shutdown" && q !== "prelaunch") {
    // Reboot briefly goes through shutdown; clear only when clearly running again
    // Keep pending if still shutting down
    if (q === "running" || (!q && s === "running")) {
      // Don't clear immediately on first poll — give a short grace via until timestamp only
      // Clear when we see running without shutdown qmp
      clearPendingGuestAction(node, type, vmid);
      return undefined;
    }
  }

  return pending;
}
