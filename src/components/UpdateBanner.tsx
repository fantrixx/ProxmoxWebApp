import { useQuery } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { useState } from "react";
import { metaApi, type AppVersionInfo } from "../api";

export function UpdateBanner({ className = "" }: { className?: string }) {
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

  // Dismiss only for this page view — a reload runs a fresh check again.
  if (dismissed || !info?.updateAvailable) {
    return null;
  }

  return (
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
        <p className="mt-1 text-xs text-muted">
          Run inside the container:{" "}
          <code className="rounded bg-bg/60 px-1.5 py-0.5 font-mono text-ink">
            {info.updateCommand}
          </code>
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink"
        onClick={() => setDismissed(true)}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export type { AppVersionInfo };
