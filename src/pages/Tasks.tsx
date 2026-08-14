import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { dataApi } from "../api";
import { Header } from "../components/Header";
import { formatSnapTime } from "../format";
import type { PveTask } from "../types";

function nodeFromUpid(upid: string, fallback?: string): string {
  if (fallback) return fallback;
  if (upid.startsWith("UPID:")) return upid.split(":")[1] || "?";
  return "?";
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
  const node = nodeFromUpid(task.upid, task.node);
  const status = task.status || "unknown";

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-2/50"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{task.type || "task"}</span>
        <span className="hidden font-mono text-xs text-muted sm:inline">
          {task.id || "—"}
        </span>
        <span className="hidden text-xs text-muted md:inline">{node}</span>
        <span className="hidden text-xs text-muted lg:inline">{task.user || "—"}</span>
        <span className={`text-xs font-medium ${taskStatusTone(status)}`}>{status}</span>
        <span className="text-xs text-muted">{formatSnapTime(task.starttime)}</span>
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
      <Header title="Tasks" subtitle={`${tasks.length} recent cluster tasks`} />
      <div className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        {q.isError ? (
          <p className="text-sm text-bad">{(q.error as Error).message}</p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted">No tasks found.</p>
        ) : (
          <div className="space-y-2">
            <div className="hidden px-4 text-[11px] uppercase tracking-wide text-muted sm:grid sm:grid-cols-[auto_1fr_auto_auto_auto_auto_auto] sm:items-center sm:gap-3">
              <span className="w-4" />
              <span>Type</span>
              <span>ID</span>
              <span className="hidden md:inline">Node</span>
              <span className="hidden lg:inline">User</span>
              <span>Status</span>
              <span>Started</span>
            </div>
            {tasks.map((task) => (
              <TaskRow key={task.upid} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
