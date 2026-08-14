import { useQuery } from "@tanstack/react-query";
import { metaApi } from "../api";

export function useAppVersion() {
  return useQuery({
    queryKey: ["app-version"],
    queryFn: () => metaApi.version(true),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

/** Compact version label, e.g. "v1.2.1" or "v1.2.1 · a1b2c3d" */
export function AppVersionLabel({
  className = "",
  showCommit = false,
}: {
  className?: string;
  showCommit?: boolean;
}) {
  const q = useAppVersion();
  if (q.isLoading && !q.data) {
    return <span className={className}>…</span>;
  }
  if (!q.data) {
    return <span className={className}>v?</span>;
  }
  const commit =
    showCommit && q.data.currentCommit ? ` · ${q.data.currentCommit}` : "";
  return (
    <span
      className={className}
      title={
        q.data.updateAvailable
          ? `Update available${q.data.latestVersion ? ` (v${q.data.latestVersion})` : ""}`
          : q.data.latestMessage || undefined
      }
    >
      v{q.data.currentVersion}
      {commit}
      {q.data.updateAvailable ? " · update available" : ""}
    </span>
  );
}
