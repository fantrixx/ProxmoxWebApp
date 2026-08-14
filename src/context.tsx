import { useCallback, useContext, useEffect, useMemo, useState, createContext, type ReactNode } from "react";
import { dataApi } from "./api";
import type { AuthUser, GuestType } from "./types";

export type ConsoleTarget = {
  type: GuestType;
  node: string;
  vmid: number;
  name: string;
};

export type Toast = {
  id: string;
  kind: "ok" | "err" | "info";
  text: string;
};

export type ActiveJob = {
  id: string;
  kind: "backup" | "restore" | "task";
  title: string;
  detail: string;
  node: string;
  /** Empty while the Proxmox task id is not known yet. */
  upid: string;
  vmid?: string;
  startedAt: number;
  error?: string;
};

const JOBS_KEY = "proxpanel.activeJobs";

function loadJobs(): ActiveJob[] {
  try {
    const raw = sessionStorage.getItem(JOBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActiveJob[];
    if (!Array.isArray(parsed)) return [];
    // Drop stale jobs older than 6 hours.
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    return parsed.filter((j) => j && j.id && j.startedAt >= cutoff);
  } catch {
    return [];
  }
}

function saveJobs(jobs: ActiveJob[]) {
  try {
    sessionStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  } catch {
    /* ignore quota */
  }
}

type AppContextValue = {
  user: AuthUser;
  openConsole: (t: ConsoleTarget) => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: string) => void;
  jobs: ActiveJob[];
  trackJob: (job: Omit<ActiveJob, "id" | "startedAt">) => string;
  attachJobUpid: (id: string, upid: string) => void;
  failJob: (id: string, error: string) => void;
  dismissJob: (id: string) => void;
  startGuestBackup: (opts: {
    node: string;
    type: GuestType;
    vmid: string;
    name?: string;
    storage: string;
    mode?: "snapshot" | "suspend" | "stop";
    compress?: "zstd" | "gzip" | "lzo" | "none";
  }) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

function consoleUrl(t: ConsoleTarget): string {
  const qs = new URLSearchParams({ name: t.name });
  return `/console/${encodeURIComponent(t.type)}/${encodeURIComponent(t.node)}/${t.vmid}?${qs}`;
}

function consoleWindowName(t: ConsoleTarget): string {
  return `proxpanel-shell-${t.type}-${t.node}-${t.vmid}`;
}

/**
 * Open (or restore) a detached shell window.
 * If a shell for this guest is already open, just focus it — like un-minimizing.
 */
export function openDetachedConsole(t: ConsoleTarget) {
  const url = consoleUrl(t);
  const winName = consoleWindowName(t);
  const features =
    "popup=yes,width=1100,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no";

  let win: Window | null = null;
  try {
    // Empty URL returns an existing named window without navigating away.
    win = window.open("", winName, features);
  } catch {
    win = null;
  }

  if (!win) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    const path = win.location.pathname || "";
    const alreadyOpen =
      !win.closed &&
      win.location.origin === window.location.origin &&
      path.includes("/console/");
    if (alreadyOpen) {
      win.focus();
      return;
    }
  } catch {
    /* about:blank during first create */
  }

  win.location.href = url;
  win.focus();
}

export function shellStorageKey(type: string, node: string, vmid: string | number): string {
  return `proxpanel.shell.buffer.${type}.${node}.${vmid}`;
}

export function AppProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [jobs, setJobs] = useState<ActiveJob[]>(() => loadJobs());

  useEffect(() => {
    saveJobs(jobs);
  }, [jobs]);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const attachJobUpid = useCallback((id: string, upid: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, upid, error: undefined } : j)),
    );
  }, []);

  const failJob = useCallback((id: string, error: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, error } : j)),
    );
  }, []);

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const trackJob = useCallback((job: Omit<ActiveJob, "id" | "startedAt">) => {
    const id = crypto.randomUUID();
    setJobs((prev) => {
      const rest = job.upid ? prev.filter((j) => j.upid !== job.upid) : prev;
      return [...rest, { ...job, id, startedAt: Date.now() }];
    });
    return id;
  }, []);

  const startGuestBackup = useCallback(
    async (opts: {
      node: string;
      type: GuestType;
      vmid: string;
      name?: string;
      storage: string;
      mode?: "snapshot" | "suspend" | "stop";
      compress?: "zstd" | "gzip" | "lzo" | "none";
    }) => {
      const label = opts.name || `Guest ${opts.vmid}`;
      const jobId = trackJob({
        kind: "backup",
        title: `Backup · ${label}`,
        detail: `${opts.type === "lxc" ? "CT" : "VM"} ${opts.vmid} → ${opts.storage} · ${opts.node}`,
        node: opts.node,
        upid: "",
        vmid: opts.vmid,
      });
      try {
        const res = await dataApi.startBackup(opts.node, opts.type, opts.vmid, {
          storage: opts.storage,
          mode: opts.mode,
          compress: opts.compress,
        });
        if (res.upid) {
          attachJobUpid(jobId, res.upid);
          toast("ok", "Backup started.");
        } else {
          failJob(jobId, "No task id returned by Proxmox.");
          toast("err", "Backup started but no task id was returned.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Backup failed.";
        failJob(jobId, message);
        toast("err", message);
      }
    },
    [trackJob, attachJobUpid, failJob, toast],
  );

  const value = useMemo(
    () => ({
      user,
      openConsole: openDetachedConsole,
      toasts,
      toast,
      dismissToast,
      jobs,
      trackJob,
      attachJobUpid,
      failJob,
      dismissJob,
      startGuestBackup,
    }),
    [
      user,
      toasts,
      toast,
      dismissToast,
      jobs,
      trackJob,
      attachJobUpid,
      failJob,
      dismissJob,
      startGuestBackup,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
