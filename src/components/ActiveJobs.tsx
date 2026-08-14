import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, X, XCircle } from "lucide-react";
import { dataApi } from "../api";
import { formatDuration } from "../format";
import { useApp, type ActiveJob } from "../context";

function nodeFromUpid(upid: string, fallback: string): string {
  if (fallback) return fallback;
  if (upid.startsWith("UPID:")) return upid.split(":")[1] || "?";
  return "?";
}

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

function kindLabel(kind: ActiveJob["kind"], phase: "run" | "ok" | "fail"): string {
  const base = kind === "backup" ? "Backup" : kind === "restore" ? "Restore" : "Task";
  if (phase === "run") return base;
  if (phase === "ok") return `${base} finished`;
  return `${base} failed`;
}

type JobSnapshot = {
  running: boolean;
  failed: boolean;
  ok: boolean;
  progress: number | null;
  elapsedSec: number;
  etaSec: number | null;
  exitstatus: string;
  latestLog?: string;
};

function useJobSnapshot(job: ActiveJob): JobSnapshot & { dismiss: () => void } {
  const { dismissJob, attachJobUpid } = useApp();
  const qc = useQueryClient();
  const node = nodeFromUpid(job.upid, job.node);
  const pending = !job.upid && !job.error;
  const [now, setNow] = useState(Date.now());
  const [doneAt, setDoneAt] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const recoverQ = useQuery({
    queryKey: ["tasks", "recover", job.id, job.vmid, job.node, job.kind],
    queryFn: () => dataApi.tasks(30),
    enabled: pending,
    refetchInterval: pending ? 2000 : false,
  });

  useEffect(() => {
    if (!pending || !recoverQ.data?.tasks?.length) return;
    const hint = job.kind === "backup" ? "vzdump" : job.kind === "restore" ? "restore" : "";
    const match = recoverQ.data.tasks.find((t) => {
      if (!t.upid) return false;
      if (job.vmid && String(t.id || "") !== String(job.vmid)) return false;
      if (t.node && t.node !== job.node) return false;
      const type = String(t.type || "").toLowerCase();
      if (hint && !type.includes(hint) && type !== hint) return false;
      const status = String(t.status || "").toLowerCase();
      return status === "running" || !status;
    });
    if (match?.upid) attachJobUpid(job.id, match.upid);
  }, [pending, recoverQ.data, job, attachJobUpid]);

  const statusQ = useQuery({
    queryKey: ["jobStatus", node, job.upid],
    queryFn: () => dataApi.taskStatus(node, job.upid),
    enabled: Boolean(job.upid) && !job.error,
    retry: 2,
    refetchInterval: (q) => {
      const status = String(q.state.data?.status || "").toLowerCase();
      return status === "stopped" ? false : 2000;
    },
  });

  const status = pending || job.error
    ? job.error
      ? "stopped"
      : "running"
    : String(statusQ.data?.status || "running").toLowerCase();
  const running = !job.error && (pending || status !== "stopped");
  const exitstatus = job.error || String(statusQ.data?.exitstatus || "");
  const failed =
    Boolean(job.error) ||
    (!pending &&
      !running &&
      ((statusQ.isError && statusQ.failureCount > 2) ||
        (exitstatus.length > 0 && !/^ok$/i.test(exitstatus))));
  const ok = !pending && !running && !failed;

  const logQ = useQuery({
    queryKey: ["jobLog", node, job.upid],
    queryFn: () => dataApi.taskLog(node, job.upid),
    enabled: Boolean(job.upid) && (running || failed) && !job.error,
    refetchInterval: running ? 2500 : false,
  });

  const progress = pending
    ? null
    : running
      ? parseProgressFromLog(logQ.data?.log || [])
      : failed
        ? null
        : 100;
  const elapsedSec = Math.max(0, ((doneAt ?? now) - job.startedAt) / 1000);
  const etaSec =
    running && progress != null && progress >= 5 && progress < 100
      ? (elapsedSec * (100 - progress)) / progress
      : null;

  useEffect(() => {
    if (pending || running || doneAt != null) return;
    setDoneAt(Date.now());
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["guestBackups"] });
  }, [pending, running, doneAt, qc]);

  useEffect(() => {
    if (pending || running || failed) return;
    const id = window.setTimeout(() => dismissJob(job.id), 12000);
    return () => window.clearTimeout(id);
  }, [pending, running, failed, dismissJob, job.id]);

  const latestLog = job.error
    ? job.error
    : pending
      ? "Starting backup task…"
      : [...(logQ.data?.log || [])].reverse().find((line) => (line.t || "").trim())?.t;

  return {
    running,
    failed,
    ok,
    progress,
    elapsedSec,
    etaSec,
    exitstatus,
    latestLog,
    dismiss: () => dismissJob(job.id),
  };
}

function ProgressBar({
  progress,
  running,
  failed,
  ok,
}: {
  progress: number | null;
  running: boolean;
  failed: boolean;
  ok: boolean;
}) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-bg">
      {progress == null && running ? (
        <div className="relative h-full w-full overflow-hidden">
          <div className="absolute inset-y-0 w-2/5 animate-[job-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
        </div>
      ) : (
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            failed ? "bg-bad" : ok ? "bg-good" : "bg-accent"
          }`}
          style={{ width: `${progress ?? (failed ? 100 : 8)}%` }}
        />
      )}
    </div>
  );
}

function StatusIcon({ running, failed }: { running: boolean; failed: boolean }) {
  if (running) return <Loader2 className="size-5 shrink-0 animate-spin text-accent" aria-hidden />;
  if (failed) return <XCircle className="size-5 shrink-0 text-bad" aria-hidden />;
  return <CheckCircle2 className="size-5 shrink-0 text-good" aria-hidden />;
}

function JobRow({
  job,
  snapshot,
  onDismiss,
  compact,
}: {
  job: ActiveJob;
  snapshot: JobSnapshot;
  onDismiss: () => void;
  compact?: boolean;
}) {
  const phase = snapshot.running ? "run" : snapshot.failed ? "fail" : "ok";
  const title = snapshot.running ? job.title : kindLabel(job.kind, phase);

  return (
    <div className={compact ? "px-4 py-3 md:px-8" : "px-4 py-4 md:px-8"}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <StatusIcon running={snapshot.running} failed={snapshot.failed} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight">{title}</p>
              <p className="mt-0.5 truncate text-sm text-muted">{job.detail}</p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink sm:min-h-0 sm:min-w-0 sm:p-1.5"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-3">
            <ProgressBar
              progress={snapshot.progress}
              running={snapshot.running}
              failed={snapshot.failed}
              ok={snapshot.ok}
            />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-muted">
              <span>
                {snapshot.running
                  ? snapshot.progress != null
                    ? `${Math.round(snapshot.progress)}% · ${formatDuration(snapshot.elapsedSec)}`
                    : job.upid
                      ? `In progress · ${formatDuration(snapshot.elapsedSec)}`
                      : `Starting… · ${formatDuration(snapshot.elapsedSec)}`
                  : snapshot.failed
                    ? `Failed after ${formatDuration(snapshot.elapsedSec)}${
                        snapshot.exitstatus ? ` · ${snapshot.exitstatus}` : ""
                      }`
                    : `Done in ${formatDuration(snapshot.elapsedSec)}`}
              </span>
              {snapshot.etaSec != null ? (
                <span>~{formatDuration(snapshot.etaSec)} left</span>
              ) : null}
            </div>
          </div>

          {snapshot.latestLog && (snapshot.running || snapshot.failed) ? (
            <p
              className={`mt-2 truncate font-mono text-[11px] ${
                snapshot.failed ? "text-bad" : "text-muted/90"
              }`}
            >
              {snapshot.latestLog}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function JobItem({
  job,
  compact,
  onSnapshot,
}: {
  job: ActiveJob;
  compact?: boolean;
  onSnapshot?: (id: string, snap: JobSnapshot) => void;
}) {
  const { dismiss, ...snapshot } = useJobSnapshot(job);

  useEffect(() => {
    onSnapshot?.(job.id, snapshot);
  }, [
    job.id,
    onSnapshot,
    snapshot.running,
    snapshot.failed,
    snapshot.ok,
    snapshot.progress,
    snapshot.elapsedSec,
    snapshot.etaSec,
    snapshot.exitstatus,
    snapshot.latestLog,
  ]);

  return <JobRow job={job} snapshot={snapshot} onDismiss={dismiss} compact={compact} />;
}

function JobSnapshotSink({
  job,
  onSnapshot,
}: {
  job: ActiveJob;
  onSnapshot: (id: string, snap: JobSnapshot) => void;
}) {
  const { dismiss: _dismiss, ...snapshot } = useJobSnapshot(job);
  useEffect(() => {
    onSnapshot(job.id, snapshot);
  }, [
    job.id,
    onSnapshot,
    snapshot.running,
    snapshot.failed,
    snapshot.ok,
    snapshot.progress,
    snapshot.elapsedSec,
    snapshot.etaSec,
    snapshot.exitstatus,
    snapshot.latestLog,
  ]);
  return null;
}

function MultiJobBanner({ jobs }: { jobs: ActiveJob[] }) {
  const [expanded, setExpanded] = useState(false);
  const [snaps, setSnaps] = useState<Record<string, JobSnapshot>>({});

  function onSnapshot(id: string, snap: JobSnapshot) {
    setSnaps((prev) => {
      const cur = prev[id];
      if (
        cur &&
        cur.running === snap.running &&
        cur.failed === snap.failed &&
        cur.ok === snap.ok &&
        cur.progress === snap.progress &&
        cur.elapsedSec === snap.elapsedSec &&
        cur.etaSec === snap.etaSec &&
        cur.latestLog === snap.latestLog &&
        cur.exitstatus === snap.exitstatus
      ) {
        return prev;
      }
      return { ...prev, [id]: snap };
    });
  }

  const list = jobs.map((j) => snaps[j.id]).filter(Boolean);
  const runningCount = Math.max(
    list.filter((s) => s.running).length,
    list.length < jobs.length ? jobs.length - list.filter((s) => !s.running).length : 0,
  );
  const activeRunning = list.some((s) => s.running) || list.length < jobs.length;
  const failedCount = list.filter((s) => s.failed).length;
  const doneCount = list.filter((s) => s.ok).length;
  const progresses = list.map((s) => s.progress).filter((p): p is number => p != null);
  const avgProgress =
    progresses.length > 0
      ? progresses.reduce((a, b) => a + b, 0) / progresses.length
      : null;
  const allFailed = list.length === jobs.length && failedCount === jobs.length && !activeRunning;

  return (
    <div className="border-t border-accent/40 bg-surface-2">
      {!expanded
        ? jobs.map((job) => (
            <JobSnapshotSink key={job.id} job={job} onSnapshot={onSnapshot} />
          ))
        : null}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface/60 md:px-8"
        aria-expanded={expanded}
      >
        <StatusIcon running={activeRunning} failed={allFailed} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-semibold">
              {activeRunning
                ? `${Math.max(runningCount, 1)} active job${
                    Math.max(runningCount, 1) === 1 ? "" : "s"
                  }`
                : failedCount > 0
                  ? `${failedCount} job${failedCount === 1 ? "" : "s"} failed`
                  : `${Math.max(doneCount, jobs.length)} job${
                      Math.max(doneCount, jobs.length) === 1 ? "" : "s"
                    } finished`}
            </p>
            {expanded ? (
              <ChevronDown className="size-4 shrink-0 text-muted" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted" />
            )}
          </div>
          {!expanded ? (
            <div className="mt-2">
              <ProgressBar
                progress={avgProgress}
                running={activeRunning}
                failed={allFailed}
                ok={!activeRunning && !allFailed}
              />
              <p className="mt-1.5 truncate text-xs text-muted">
                {jobs[0]?.title}
                {jobs.length > 1 ? ` · +${jobs.length - 1} more` : ""}
              </p>
            </div>
          ) : null}
        </div>
        <Link
          to="/tasks"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-xs font-medium text-accent hover:underline"
        >
          Tasks
        </Link>
      </button>

      {expanded ? (
        <div className="divide-y divide-line border-t border-line">
          {jobs.map((job) => (
            <JobItem key={job.id} job={job} compact onSnapshot={onSnapshot} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SingleJobBanner({ job }: { job: ActiveJob }) {
  return (
    <div className="border-t border-accent/40 bg-surface-2">
      <JobItem job={job} />
      <div className="border-t border-line px-4 py-2 md:px-8">
        <Link to="/tasks" className="text-xs font-medium text-accent hover:underline">
          Open Tasks
        </Link>
      </div>
    </div>
  );
}

/** Full-width progress strip shown directly under the page header. */
export function ActiveJobsBanner() {
  const { jobs } = useApp();
  if (!jobs.length) return null;
  if (jobs.length === 1) return <SingleJobBanner job={jobs[0]} />;
  return <MultiJobBanner jobs={jobs} />;
}
