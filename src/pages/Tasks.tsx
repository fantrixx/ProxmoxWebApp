import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { dataApi } from "../api";
import { Header } from "../components/Header";
import { formatSnapTime } from "../format";
import type { PveTask } from "../types";

/** UPID:<node>:<pid>:<pstart>:<starttime>:<type>:<id>:<user> */
function parseUpid(upid: string): {
  node?: string;
  type?: string;
  id?: string;
  user?: string;
} {
  if (!upid.startsWith("UPID:")) return {};
  const parts = upid.split(":");
  return {
    node: parts[1],
    type: parts[5],
    id: parts[6] || undefined,
    user: parts.slice(7).join(":").replace(/:$/, "") || undefined,
  };
}

function taskTypeLabel(type?: string): string {
  switch ((type || "").toLowerCase()) {
    case "vzdump":
      return "Backup";
    case "qmrestore":
      return "Restore VM";
    case "vzrestore":
      return "Restore CT";
    case "qmstart":
      return "Start VM";
    case "qmstop":
      return "Stop VM";
    case "qmshutdown":
      return "Shutdown VM";
    case "qmreboot":
    case "qmreset":
      return "Reboot VM";
    case "qmsuspend":
      return "Suspend VM";
    case "qmresume":
      return "Resume VM";
    case "vzstart":
      return "Start CT";
    case "vzstop":
      return "Stop CT";
    case "vzshutdown":
      return "Shutdown CT";
    case "vzreboot":
      return "Reboot CT";
    case "qmsnapshot":
    case "vzsnapshot":
      return "Snapshot";
    case "qmdelsnapshot":
    case "vzdelsnapshot":
      return "Delete snapshot";
    case "qmrollback":
    case "vzrollback":
      return "Rollback";
    case "imgcopy":
    case "qmclone":
    case "vzclone":
      return "Clone";
    case "qmmove":
    case "vzmove":
      return "Move disk";
    case "aptupdate":
      return "Update packages";
    case "startall":
      return "Start all";
    case "stopall":
      return "Stop all";
    case "migrate":
    case "qmigrate":
      return "Migrate";
    default:
      return type ? type.replace(/^qm/, "VM ").replace(/^vz/, "CT ") : "Task";
  }
}

function taskHeadline(task: PveTask): { title: string; subtitle: string } {
  const parsed = parseUpid(task.upid);
  const type = task.type || parsed.type;
  const id = task.id || parsed.id;
  const node = task.node || parsed.node || "?";
  const user = task.user || parsed.user;
  const label = taskTypeLabel(type);
  const target =
    id && id !== "-"
      ? /^\d+$/.test(id)
        ? `guest ${id}`
        : id
      : null;

  const title = target ? `${label} · ${target}` : label;
  const bits = [node];
  if (user) bits.push(user);
  return { title, subtitle: bits.join(" · ") };
}

function displayStatus(task: PveTask): string {
  const s = (task.status || "").toLowerCase();
  if (s === "running") return "running";
  if (s === "ok" || s === "stopped") return "OK";
  if (!s) return "unknown";
  return task.status || "unknown";
}

function taskStatusTone(status?: string): string {
  if (!status) return "text-muted";
  const s = status.toLowerCase();
  if (s === "running") return "text-warn";
  if (s === "ok" || s === "stopped") return "text-good";
  if (s.includes("err") || s.includes("fail") || s === "unknown") return "text-bad";
  return "text-muted";
}

function TaskLog({ node, upid }: { node: string; upid: string }) {
  const log = useQuery({
    queryKey: ["taskLog", node, upid],
    queryFn: () => dataApi.taskLog(node, upid),
  });

  if (log.isLoading) return <p className="px-4 py-3 text-xs text-muted">Loading log…</p>;
  if (log.isError) {
    return (
      <p className="px-4 py-3 text-xs text-bad">{(log.error as Error).message}</p>
    );
  }

  const lines = log.data?.log || [];
  if (lines.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted">No log lines.</p>;
  }

  return (
    <pre className="max-h-64 overflow-auto border-t border-line bg-bg px-4 py-3 font-mono text-[11px] leading-relaxed text-muted">
      {lines.map((line, i) => (
        <div key={line.n ?? i}>{line.t ?? ""}</div>
      ))}
    </pre>
  );
}

function TaskRow({ task }: { task: PveTask }) {
  const [open, setOpen] = useState(false);
  const parsed = parseUpid(task.upid);
  const node = task.node || parsed.node || "?";
  const status = displayStatus(task);
  const { title, subtitle } = taskHeadline(task);

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-2/50 md:px-4 md:py-3"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="truncate text-[11px] text-muted">{subtitle}</div>
        </div>
        <span className={`shrink-0 text-xs font-medium ${taskStatusTone(task.status)}`}>
          {status}
        </span>
        <span className="hidden shrink-0 text-xs text-muted sm:inline">
          {formatSnapTime(task.starttime)}
        </span>
      </button>
      {open ? <TaskLog node={node} upid={task.upid} /> : null}
    </div>
  );
}

export default function TasksPage() {
  const q = useQuery({
    queryKey: ["tasks"],
    queryFn: () => dataApi.tasks(50),
    refetchInterval: 3000,
  });

  const tasks = Array.isArray(q.data?.tasks) ? q.data.tasks : [];

  return (
    <div>
      <Header title="Tasks" subtitle={`${tasks.length} recent tasks`} />
      <div className="space-y-3 px-4 py-3 md:space-y-4 md:px-8 md:py-6">
        {q.isError ? (
          <p className="text-sm text-bad">{(q.error as Error).message}</p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted">No tasks found.</p>
        ) : (
          <div className="space-y-1.5 md:space-y-2">
            {tasks.map((task) => (
              <TaskRow key={task.upid} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
