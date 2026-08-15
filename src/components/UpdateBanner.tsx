import { useQuery } from "@tanstack/react-query";
import { Download, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, metaApi, type AppVersionInfo } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";

const UPDATE_FLAG_KEY = "proxpanel.update.inFlight";
const HEALTH_POLL_MS = 2000;
const UPDATE_TIMEOUT_MS = 10 * 60 * 1000;

async function waitForAppRestart(signal: AbortSignal): Promise<void> {
  const started = Date.now();
  let sawDowntime = false;

  while (!signal.aborted) {
    if (Date.now() - started > UPDATE_TIMEOUT_MS) {
      throw new Error(
        "Update is taking too long. Check journalctl -u proxpanel or /tmp/proxpanel-update/update.log",
      );
    }

    // While the old process is still up, detect an early failure (e.g. git/npm error).
    if (!sawDowntime) {
      let updateFailed: string | null = null;
      try {
        const res = await fetch("/api/update", {
          credentials: "include",
          cache: "no-store",
          signal,
        });
        if (res.ok) {
          const status = (await res.json()) as {
            state?: string;
            error?: string;
          };
          if (status.state === "failed") {
            updateFailed = status.error || "Update failed.";
          }
        }
      } catch {
        if (!signal.aborted) sawDowntime = true;
      }
      if (updateFailed) throw new Error(updateFailed);
    }

    try {
      const res = await fetch("/api/health", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (res.ok) {
        if (sawDowntime) return;
      } else {
        sawDowntime = true;
      }
    } catch {
      if (!signal.aborted) sawDowntime = true;
    }

    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
}

export function UpdateBanner({
  className = "",
  canUpdate = false,
}: {
  className?: string;
  /** When true, allow triggering an in-app update if the host supports it. */
  canUpdate?: boolean;
}) {
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
  const [dismissed, setDismissed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const showUpdateButton = Boolean(canUpdate && info?.canUpdate);

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
    }
  }

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
              Updating from GitHub and restarting the service… This page will reload
              automatically.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                {showUpdateButton
                  ? "Update now pulls the latest release, rebuilds the app, and restarts the service."
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
        <ConfirmDialog
          title="Update ProxPanel now?"
          body="This pulls the latest version from GitHub, rebuilds the app, and restarts the ProxPanel service. The UI will be briefly unavailable and you may need to sign in again."
          confirmLabel="Update now"
          busy={updating}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void runUpdate()}
        />
      ) : null}
    </>
  );
}

export type { AppVersionInfo };
