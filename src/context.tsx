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

type AppContextValue = {
  user: AuthUser;
  openConsole: (t: ConsoleTarget) => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function consoleUrl(t: ConsoleTarget): string {
  const qs = new URLSearchParams({
    name: t.name,
    // Bust cache / force a fresh document so reopening never reuses a stale session.
    t: String(Date.now()),
  });
  return `/console/${encodeURIComponent(t.type)}/${encodeURIComponent(t.node)}/${t.vmid}?${qs}`;
}

/** Open shell in a detached popup (falls back to a new tab if blocked). */
export function openDetachedConsole(t: ConsoleTarget) {
  const url = consoleUrl(t);
  const winName = `proxpanel-shell-${t.type}-${t.node}-${t.vmid}`;
  const features =
    "popup=yes,width=1100,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no";
  const win = window.open(url, winName, features);
  if (!win) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    // Same window name reuses the popup — force navigate to the fresh URL.
    if (win.location.href !== url && win.location.href !== "about:blank") {
      win.location.href = url;
    }
  } catch {
    /* cross-opaque briefly during load — ignore */
  }
  win.focus();
}

export function AppProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const value = useMemo(
    () => ({
      user,
      openConsole: openDetachedConsole,
      toasts,
      toast,
      dismissToast,
    }),
    [user, toasts, toast, dismissToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
