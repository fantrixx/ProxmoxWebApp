import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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
  consoleTarget: ConsoleTarget | null;
  openConsole: (t: ConsoleTarget) => void;
  closeConsole: () => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const [consoleTarget, setConsoleTarget] = useState<ConsoleTarget | null>(null);
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
      consoleTarget,
      openConsole: setConsoleTarget,
      closeConsole: () => setConsoleTarget(null),
      toasts,
      toast,
      dismissToast,
    }),
    [user, consoleTarget, toasts, toast, dismissToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
