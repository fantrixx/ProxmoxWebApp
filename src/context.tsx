import { useCallback, useContext, useMemo, useState, createContext, type ReactNode } from "react";
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
  startedAt: number;
};

type AppContextValue = {
  user: AuthUser;
  openConsole: (t: ConsoleTarget) => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: string) => void;
  jobs: ActiveJob[];
  trackJob: (job: Omit<ActiveJob, "id" | "startedAt">) => string;
  attachJobUpid: (id: string, upid: string) => void;
  dismissJob: (id: string) => void;
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
  const [jobs, setJobs] = useState<ActiveJob[]>([]);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const trackJob = useCallback((job: Omit<ActiveJob, "id" | "startedAt">) => {
    const id = crypto.randomUUID();
    setJobs((prev) => {
      const rest = job.upid ? prev.filter((j) => j.upid !== job.upid) : prev;
      return [...rest, { ...job, id, startedAt: Date.now() }];
    });
    return id;
  }, []);

  const attachJobUpid = useCallback((id: string, upid: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, upid } : j)),
    );
  }, []);

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

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
      dismissJob,
    }),
    [user, toasts, toast, dismissToast, jobs, trackJob, attachJobUpid, dismissJob],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
