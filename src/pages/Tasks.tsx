import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  HardDriveDownload,
  ListTodo,
  LoaderCircle,
  Package,
  Power,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { dataApi } from "../api";
import { Header } from "../components/Header";
import { formatClockTime, formatDuration, formatRelativeTime } from "../format";
import { useResources } from "../hooks";
import {
  describeTask,
  parseUpid,
  summarizeSince,
  taskKind,
  taskOutcome,
  type TaskGuestMap,
  type TaskKind,
} from "../taskCopy";
import type { PveTask } from "../types";
import { readVisit, visitCutoffMs } from "../visit";

type FilterId = "since" | "running" | "failed" | "all";

const KIND_ICON: Record<TaskKind, typeof Power> = {
  backup: HardDriveDownload,
  restore: RotateCcw,
  power: Power,
  snapshot: Camera,
  migrate: ArrowRightLeft,
  clone: Copy,
  host: Package,
  other: ListTodo,
};

function guestIndex(resources: ReturnType<typeof useResources>["data"]): TaskGuestMap {
  const map: TaskGuestMap = new Map();
  for (const r of resources?.resources || []) {
    if ((r.type === "lxc" || r.type === "qemu") && r.vmid != null) {
      map.set(String(r.vmid), {
        name: r.name || `${r.type === "qemu" ? "VM" : "CT"} ${r.vmid}`,
        kind: r.type === "qemu" ? "VM" : "CT",
      });
    }
  }
  return map;
}

function TaskLog({ node, upid }: { node: string; upid: string }) {
  const log = useQuery({
    queryKey: ["taskLog", node, upid],
    queryFn: () => dataApi.taskLog(node, upid),
  });

  if (log.isLoading) return <p className="px-4 py-3 text-xs text-muted">Loading details…</p>;
  if (log.isError) {
    return (
      <p className="px-4 py-3 text-xs text-bad">{(log.error as Error).message}</p>
    );
  }

  const lines = log.data?.log || [];
  if (lines.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted">No extra details for this event.</p>;
  }

  return (
    <pre className="max-h-64 overflow-auto border-t border-line bg-bg px-4 py-3 font-mono text-[11px] leading-relaxed text-muted">
      {lines.map((line, i) => (
        <div key={line.n ?? i}>{line.t ?? ""}</div>
      ))}
    </pre>
  );
}

function OutcomeBadge({ task }: { task: PveTask }) {
  const outcome = taskOutcome(task);
  if (outcome === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn">
        <LoaderCircle className="size-3 animate-spin" />
        Running
      </span>
    );
  }
  if (outcome === "fail") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-bad/15 px-2 py-0.5 text-[11px] font-medium text-bad">
        <XCircle className="size-3" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 text-[11px] font-medium text-good">
      <CheckCircle2 className="size-3" />
      Done
    </span>
  );
}

function MetaSep() {
  return <span className="text-line-2">·</span>;
}

function TaskRow({ task, guests }: { task: PveTask; guests: TaskGuestMap }) {
  const [open, setOpen] = useState(false);
  const parsed = parseUpid(task.upid);
  const node = task.node || parsed.node || "?";
  const copy = describeTask(task, guests);
  const Icon = KIND_ICON[copy.kind];
  const running = copy.outcome === "running";
  const elapsedSec = task.starttime
    ? running
      ? Math.max(0, Date.now() / 1000 - task.starttime)
      : null
    : null;
  const durationSec =
    !running && task.starttime && task.endtime && task.endtime >= task.starttime
      ? task.endtime - task.starttime
      : elapsedSec;
  const duration = durationSec != null ? formatDuration(durationSec) : null;
  const durationLabel = duration ? (running ? `${duration} so far` : duration) : null;
  const meta: string[] = [];
  if (copy.target.tag && copy.target.name) meta.push(copy.target.tag);
  else if (copy.target.tag && !copy.title.includes(copy.target.tag)) meta.push(copy.target.tag);
  meta.push(copy.node);
  if (durationLabel) meta.push(durationLabel);
  if (copy.userLabel) meta.push(copy.userLabel);
  meta.push(formatClockTime(task.starttime));
  const relative = formatRelativeTime(task.starttime);
  if (relative !== "just now" && relative !== "—") meta.push(relative);

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-2/50 md:items-center md:gap-3 md:px-4 md:py-3"
      >
        {open ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted md:mt-0" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted md:mt-0" />
        )}
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-bg text-muted md:mt-0">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium leading-snug">{copy.title}</span>
            <span
              className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted"
              title={copy.typeKey}
            >
              {copy.kindLabel}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-relaxed text-muted">
            {meta.map((bit, i) => (
              <span key={`${bit}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 ? <MetaSep /> : null}
                {bit}
              </span>
            ))}
          </div>
          {copy.statusNote ? (
            <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-bad">
              {copy.statusNote}
            </div>
          ) : null}
        </div>
        <OutcomeBadge task={task} />
      </button>
      {open ? <TaskLog node={node} upid={task.upid} /> : null}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium md:rounded-lg md:px-2.5 md:py-1 md:text-xs ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

export default function TasksPage() {
  const visit = useMemo(() => readVisit(), []);
  const cutoffMs = visitCutoffMs(visit);
  const [filter, setFilter] = useState<FilterId>("since");

  const q = useQuery({
    queryKey: ["tasks"],
    queryFn: () => dataApi.tasks(200),
    refetchInterval: 3000,
  });
  const resources = useResources();
  const guests = useMemo(() => guestIndex(resources.data), [resources.data]);

  const tasks = Array.isArray(q.data?.tasks) ? q.data.tasks : [];
  const sinceTasks = tasks.filter((t) => (t.starttime || 0) * 1000 >= cutoffMs);
  const runningTasks = tasks.filter((t) => taskOutcome(t) === "running");
  const failedTasks = tasks.filter((t) => taskOutcome(t) === "fail");

  const view =
    filter === "since"
      ? sinceTasks
      : filter === "running"
        ? runningTasks
        : filter === "failed"
          ? failedTasks
          : tasks;

  const summary = summarizeSince(sinceTasks);
  const sinceLabel = visit.previousAt
    ? `Since you last signed in (${formatRelativeTime(Math.round(visit.previousAt / 1000))})`
    : "Since you signed in";

  const empty =
    filter === "since"
      ? "Nothing happened on the server since you last signed in. That’s a good sign."
      : filter === "running"
        ? "Nothing is running right now."
        : filter === "failed"
          ? "No failed jobs in the recent list."
          : "No recent activity yet.";

  return (
    <div>
      <Header
        title="Tasks"
        subtitle={
          runningTasks.length
            ? `${runningTasks.length} running now`
            : "What happened on the cluster"
        }
      />
      <div className="space-y-3 px-4 py-3 md:space-y-4 md:px-8 md:py-6">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm font-medium">{sinceLabel}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {sinceTasks.length === 0
              ? "The cluster has been quiet since then."
              : summary.join(" · ")}
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Chip active={filter === "since"} onClick={() => setFilter("since")}>
            Since last sign-in
          </Chip>
          <Chip active={filter === "running"} onClick={() => setFilter("running")}>
            Running
          </Chip>
          <Chip active={filter === "failed"} onClick={() => setFilter("failed")}>
            Failed
          </Chip>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All recent
          </Chip>
        </div>

        {q.isError ? (
          <p className="text-sm text-bad">{(q.error as Error).message}</p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted">Looking up cluster activity…</p>
        ) : view.length === 0 ? (
          <p className="text-sm text-muted">{empty}</p>
        ) : (
          <div className="space-y-1.5 md:space-y-2">
            {view.map((task) => (
              <TaskRow key={task.upid} task={task} guests={guests} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
