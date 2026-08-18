import { useQuery } from "@tanstack/react-query";
import { Download, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, metaApi, type AppVersionInfo } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";

const UPDATE_FLAG_KEY = "proxpanel.update.inFlight";
const HEALTH_POLL_MS = 2000;
const UPDATE_TIMEOUT_MS = 10 * 60 * 1000;

type TerminalUpdate = {
  state?: string;
  error?: string;
  previousCommit?: string | null;
  rolledBack?: boolean;
};

async function readUpdateStatus(signal: AbortSignal): Promise<TerminalUpdate | null> {
  try {
    const res = await fetch("/api/update", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as TerminalUpdate;
  } catch {
    return null;
  }
}

function terminalError(status: TerminalUpdate): string | null {
  if (status.state === "failed") {
    return status.error || "Update failed.";
  }
  if (status.state === "rolled_back" || status.rolledBack) {
    const short = status.previousCommit ? status.previousCommit.slice(0, 7) : null;
    return (
      status.error ||
      (short
        ? `Update failed; restored previous working version (${short}).`
        : "Update failed; restored the previous working version.")
    );
  }
  return null;
}

async function waitForAppRestart(signal: AbortSignal): Promise<void> {
  const started = Date.now();
  let sawDowntime = false;

  while (!signal.aborted) {
    if (Date.now() - started > UPDATE_TIMEOUT_MS) {
      throw new Error(
        "Update is taking too long. Check journalctl -u proxpanel or /tmp/proxpanel-update/update.log",
      );
    }

    const status = await readUpdateStatus(signal);
    if (status) {
      const err = terminalError(status);
      if (err) throw new Error(err);
    } else {
      // Status unreachable — restart (or rollback restart) is likely in progress.
      sawDowntime = true;
    }

    let healthy = false;
    try {
      const res = await fetch("/api/health", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      healthy = res.ok;
      if (!res.ok) sawDowntime = true;
    } catch {
      if (!signal.aborted) sawDowntime = true;
    }

    if (healthy && sawDowntime) {
      const after = await readUpdateStatus(signal);
      if (after) {
        const err = terminalError(after);
        if (err) throw new Error(err);
      }
      return;
    }

    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
}

function useInAppUpdate() {
  const q = useQuery({
    queryKey: ["app-version"],
    queryFn: () => metaApi.version(true),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const info = q.data;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(UPDATE_FLAG_KEY) === "1" && info && !info.updateAvailable) {
        sessionStorage.removeItem(UPDATE_FLAG_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [info]);

  async function runUpdate() {
    setUpdateError(null);
    setUpdating(true);
    setConfirmOpen(false);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      sessionStorage.setItem(UPDATE_FLAG_KEY, "1");
      await metaApi.startUpdate();
      await waitForAppRestart(ac.signal);
      window.location.reload();
    } catch (err) {
      if (ac.signal.aborted) return;
      try {
        sessionStorage.removeItem(UPDATE_FLAG_KEY);
      } catch {
        /* ignore */
      }
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Update failed.";
      setUpdateError(message);
      setUpdating(false);
      void q.refetch();
    }
  }

  return {
    info,
    confirmOpen,
    setConfirmOpen,
    updating,
    updateError,
    runUpdate,
    canRun: Boolean(info?.canUpdate),
  };
}

function UpdateConfirm({
  updating,
  onCancel,
  onConfirm,
}: {
  updating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      title="Update ProxPanel now?"
      body="This pulls the latest version from GitHub, rebuilds the app, and restarts the ProxPanel service. If the update fails, the previous working version is restored automatically. The UI will be briefly unavailable and you may need to sign in again."
      confirmLabel="Update now"
      busy={updating}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/** Compact header control — shown on every signed-in page when an update is available. */
export function HeaderUpdateButton() {
  const {
    info,
    confirmOpen,
    setConfirmOpen,
    updating,
    updateError,
    runUpdate,
    canRun,
  } = useInAppUpdate();

  if (!info?.updateAvailable || !canRun) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={updating}
        title="Update ProxPanel now"
        className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[11px] font-semibold text-black hover:bg-accent-2 disabled:opacity-60 md:min-h-9 md:px-2.5 md:text-xs"
      >
        {updating ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        {updating ? "Updating…" : "Update now"}
      </button>
      {updateError ? (
        <span className="hidden max-w-40 truncate text-[10px] text-bad md:inline" title={updateError}>
          {updateError}
        </span>
      ) : null}
      {confirmOpen ? (
        <UpdateConfirm
          updating={updating}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void runUpdate()}
        />
      ) : null}
    </>
  );
}

export function UpdateBanner({
  className = "",
  canUpdate = false,
}: {
  className?: string;
  /** When true, allow triggering an in-app update if the host supports it. */
  canUpdate?: boolean;
}) {
  const {
    info,
    confirmOpen,
    setConfirmOpen,
    updating,
    updateError,
    runUpdate,
    canRun,
  } = useInAppUpdate();
  const [dismissed, setDismissed] = useState(false);
  const showUpdateButton = Boolean(canUpdate && canRun);

  // Dismiss only for this page view — a reload runs a fresh check again.
  if (dismissed || !info?.updateAvailable) {
    return null;
  }

  return (
    <>
      <div
        className={`flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-3 text-sm text-ink ${className}`}
        role="status"
      >
        <Download className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-accent-2">New ProxPanel version available</p>
          <p className="mt-0.5 text-muted">
            Installed: v{info.currentVersion}
            {info.currentCommit ? ` (${info.currentCommit})` : ""}
            {info.latestVersion ? ` · Latest: v${info.latestVersion}` : null}
            {info.latestCommit ? ` (${info.latestCommit})` : null}
            {info.latestMessage ? ` — ${info.latestMessage}` : null}
          </p>
          {updating ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted">
              <LoaderCircle className="size-3.5 animate-spin text-accent" />
              Updating from GitHub and restarting the service… If anything fails, ProxPanel
              restores the previous working version automatically.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                {showUpdateButton
                  ? "Update now pulls the latest release, rebuilds the app, and restarts the service. On failure, the previous working version is restored."
                  : (
                    <>
                      Run inside the container:{" "}
                      <code className="rounded bg-bg/60 px-1.5 py-0.5 font-mono text-ink">
                        {info.updateCommand}
                      </code>
                    </>
                  )}
              </p>
              {showUpdateButton ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-accent-2"
                  >
                    <Download className="size-3.5" />
                    Update now
                  </button>
                  <span className="text-xs text-muted">
                    Or run{" "}
                    <code className="rounded bg-bg/60 px-1.5 py-0.5 font-mono text-ink">
                      {info.updateCommand}
                    </code>{" "}
                    in the container.
                  </span>
                </div>
              ) : null}
              {updateError ? (
                <p className="mt-2 text-xs text-bad">{updateError}</p>
              ) : null}
            </>
          )}
        </div>
        {!updating ? (
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink"
            onClick={() => setDismissed(true)}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {confirmOpen ? (
        <UpdateConfirm
          updating={updating}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void runUpdate()}
        />
      ) : null}
    </>
  );
}

export type { AppVersionInfo };
