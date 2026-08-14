import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataApi } from "../api";
import { useApp, type ActiveJob } from "../context";

function parseProgressFromLog(lines: { t?: string }[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = lines[i]?.t || "";
    const match = text.match(/(?:status:\s*)?(\d+(?:\.\d+)?)\s*%/i);
    if (match) {
      const pct = Number(match[1]);
      if (Number.isFinite(pct)) return Math.min(100, Math.max(0, pct));
    }
  }
  return null;
}

export type GuestBackupProgress = {
  job: ActiveJob;
  running: boolean;
  failed: boolean;
  progress: number | null;
  label: string;
};

/** Live backup/restore progress for a guest card (from tracked jobs). */
export function useGuestBackupProgress(
  node: string | undefined,
  vmid: number | string | undefined,
): GuestBackupProgress | null {
  const { jobs } = useApp();
  const vmidStr = vmid != null ? String(vmid) : "";

  const job =
    node && vmidStr
      ? [...jobs]
          .reverse()
          .find(
            (j) =>
              (j.kind === "backup" || j.kind === "restore") &&
              j.node === node &&
              String(j.vmid || "") === vmidStr,
          )
      : undefined;

  const pending = Boolean(job && !job.upid && !job.error);

  const statusQ = useQuery({
    queryKey: ["jobStatus", job?.node, job?.upid],
    queryFn: () => dataApi.taskStatus(job!.node, job!.upid),
    enabled: Boolean(job?.upid) && !job?.error,
    refetchInterval: (q) => {
      const status = String(q.state.data?.status || "").toLowerCase();
      return status === "stopped" ? false : 2000;
    },
  });

  const running =
    Boolean(job) &&
    !job?.error &&
    (pending || String(statusQ.data?.status || "running").toLowerCase() !== "stopped");

  const logQ = useQuery({
    queryKey: ["jobLog", job?.node, job?.upid, "card"],
    queryFn: () => dataApi.taskLog(job!.node, job!.upid),
    enabled: Boolean(job?.upid) && running,
    refetchInterval: running ? 2500 : false,
  });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!job || (!running && !pending)) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [job, running, pending]);

  if (!job) return null;

  const failed = Boolean(job.error);
  const progress = failed
    ? null
    : running
      ? parseProgressFromLog(logQ.data?.log || [])
      : 100;

  void tick;

  const label = failed
    ? job.error || "Backup failed"
    : progress != null
      ? `${Math.round(progress)}%`
      : pending
        ? "Starting…"
        : "Backing up…";

  return {
    job,
    running: running || pending,
    failed,
    progress,
    label,
  };
}
