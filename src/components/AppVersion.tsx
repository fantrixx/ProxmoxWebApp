import { useQuery } from "@tanstack/react-query";
import { metaApi } from "../api";

export function useAppVersion() {
  return useQuery({
    queryKey: ["app-version"],
    queryFn: () => metaApi.version(),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/** Compact version label, e.g. "v1.2.0" or "v1.2.0 · a1b2c3d" */
export function AppVersionLabel({
  className = "",
  showCommit = false,
}: {
  className?: string;
  showCommit?: boolean;
}) {
  const q = useAppVersion();
  if (!q.data) {
    return <span className={className}>…</span>;
  }
  const commit =
    showCommit && q.data.currentCommit ? ` · ${q.data.currentCommit}` : "";
  return (
    <span className={className} title={q.data.latestMessage || undefined}>
      v{q.data.currentVersion}
      {commit}
    </span>
  );
}
