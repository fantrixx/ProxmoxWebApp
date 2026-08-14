import { useQuery } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { useState } from "react";
import { metaApi, type AppVersionInfo } from "../api";

const DISMISS_KEY = "proxpanel.updateBanner.dismissed";

function dismissedFor(commit: string | null): boolean {
  if (!commit) return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === commit;
  } catch {
    return false;
  }
}

function dismiss(commit: string | null) {
  if (!commit) return;
  try {
    sessionStorage.setItem(DISMISS_KEY, commit);
  } catch {
    /* ignore */
  }
}

export function UpdateBanner({ className = "" }: { className?: string }) {
  const q = useQuery({
    queryKey: ["app-version"],
    queryFn: () => metaApi.version(),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const info = q.data;
  const [hidden, setHidden] = useState(false);

  if (hidden || !info?.updateAvailable || dismissedFor(info.latestCommit)) {
    return null;
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-3 text-sm text-ink ${className}`}
      role="status"
    >
      <Download className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-accent-2">Neue ProxPanel-Version verfügbar</p>
        <p className="mt-0.5 text-muted">
          Installiert: {info.currentCommit || info.currentVersion}
          {info.latestCommit ? ` · Neu: ${info.latestCommit}` : null}
          {info.latestMessage ? ` — ${info.latestMessage}` : null}
        </p>
        <p className="mt-1 text-xs text-muted">
          Im Container ausführen:{" "}
          <code className="rounded bg-bg/60 px-1.5 py-0.5 font-mono text-ink">
            {info.updateCommand}
          </code>
        </p>
      </div>
      <button
        type="button"
        aria-label="Hinweis schließen"
        className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink"
        onClick={() => {
          dismiss(info.latestCommit);
          setHidden(true);
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export type { AppVersionInfo };
