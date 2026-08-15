import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Header } from "../components/Header";
import { MetricBar } from "../components/MetricBar";
import { useResources } from "../hooks";
import { formatBytes, usagePct } from "../format";
import type { ClusterResource } from "../types";

function contentLabels(content?: string): string[] {
  if (!content) return [];
  return content
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((c) => {
      switch (c) {
        case "images":
          return "Disk images";
        case "rootdir":
          return "CT volumes";
        case "vzsnap":
          return "CT snapshots";
        case "backup":
          return "Backups";
        case "iso":
          return "ISO";
        case "vztmpl":
          return "Templates";
        case "snippets":
          return "Snippets";
        default:
          return c;
      }
    });
}

function statusTone(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s === "available" || s === "active" || s === "ok") {
    return "bg-good/15 text-good";
  }
  if (s === "disabled" || s === "inactive" || s === "unknown") {
    return "bg-white/10 text-muted";
  }
  return "bg-warn/15 text-warn";
}

export default function StoragePage() {
  const q = useResources();
  const [searchParams] = useSearchParams();
  const [qtext, setQtext] = useState(() => searchParams.get("q") || "");
  const [nodeFilter, setNodeFilter] = useState<string>("all");

  const stores = useMemo(
    () => (q.data?.resources || []).filter((r) => r.type === "storage"),
    [q.data],
  );

  const nodes = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) {
      if (s.node) set.add(s.node);
    }
    return [...set].sort();
  }, [stores]);

  const filtered = useMemo(() => {
    const needle = qtext.trim().toLowerCase();
    return stores
      .filter((s) => {
        if (nodeFilter !== "all") {
          if (nodeFilter === "shared") return Boolean(s.shared);
          if (s.node !== nodeFilter) return false;
        }
        if (!needle) return true;
        const hay = `${s.storage} ${s.node} ${s.plugintype} ${s.content} ${s.status}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        const an = (a.storage || a.id || "").localeCompare(b.storage || b.id || "");
        if (an !== 0) return an;
        return (a.node || "").localeCompare(b.node || "");
      });
  }, [stores, qtext, nodeFilter]);

  const totals = useMemo(() => {
    let used = 0;
    let total = 0;
    for (const s of filtered) {
      used += s.disk || 0;
      total += s.maxdisk || 0;
    }
    return { used, total, free: Math.max(0, total - used) };
  }, [filtered]);

  return (
    <div className="max-w-full overflow-x-hidden">
      <Header
        title="Storage"
        subtitle={
          q.isLoading
            ? "Loading storage…"
            : `${filtered.length} of ${stores.length} pools · ${formatBytes(totals.free)} free`
        }
      />
      <div className="max-w-full space-y-3 px-4 py-3 md:space-y-4 md:px-8 md:py-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full min-w-0 lg:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
            <input
              value={qtext}
              onChange={(e) => setQtext(e.target.value)}
              placeholder="Search storage, node, type…"
              className="w-full min-w-0 rounded-lg border border-line bg-surface py-1.5 pr-2 pl-8 text-sm outline-none focus:border-accent md:rounded-xl md:py-2 md:pl-9"
            />
          </div>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <NodeChip
              active={nodeFilter === "all"}
              onClick={() => setNodeFilter("all")}
            >
              All
            </NodeChip>
            <NodeChip
              active={nodeFilter === "shared"}
              onClick={() => setNodeFilter("shared")}
            >
              Shared
            </NodeChip>
            {nodes.map((node) => (
              <NodeChip
                key={node}
                active={nodeFilter === node}
                onClick={() => setNodeFilter(node)}
              >
                {node}
              </NodeChip>
            ))}
          </div>
        </div>

        {filtered.length > 0 ? (
          <section className="grid grid-cols-3 gap-2 md:gap-3">
            <StatCard label="Capacity" value={formatBytes(totals.total)} />
            <StatCard label="Used" value={formatBytes(totals.used)} />
            <StatCard label="Free" value={formatBytes(totals.free)} />
          </section>
        ) : null}

        {q.isError ? (
          <p className="text-sm text-bad">{(q.error as Error).message}</p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted">Loading storage…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">No storage matches these filters.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filtered.map((s) => (
              <StorageCard key={s.id} store={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-2.5 py-2 md:rounded-2xl md:px-4 md:py-3">
      <div className="text-[10px] text-muted md:text-xs">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold tracking-tight md:mt-1 md:text-lg">
        {value}
      </div>
    </div>
  );
}

function NodeChip({
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
      className={`inline-flex cursor-pointer items-center rounded-md border px-2 py-1 text-[11px] font-medium md:rounded-lg md:px-2.5 md:text-xs ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function StorageCard({ store }: { store: ClusterResource }) {
  const used = store.disk || 0;
  const total = store.maxdisk || 0;
  const free = Math.max(0, total - used);
  const pct = usagePct(used, total);
  const contents = contentLabels(store.content);
  const available = (store.status || "").toLowerCase() === "available";

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-3 md:p-5">
      <div className="mb-3 flex items-start justify-between gap-3 md:mb-4">
        <div className="min-w-0 overflow-hidden">
          <div className="truncate font-semibold">{store.storage || store.id}</div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {store.node || "cluster"}
            {store.plugintype ? ` · ${store.plugintype}` : ""}
            {store.shared ? " · shared" : ""}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(
            store.status,
          )}`}
        >
          {store.status || (available ? "available" : "ok")}
        </span>
      </div>

      <MetricBar
        label="Usage"
        percent={pct}
        detail={`${formatBytes(used)} / ${formatBytes(total)}`}
      />

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-[11px] text-muted">Free</dt>
          <dd className="mt-0.5 font-mono">{formatBytes(free)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-muted">Type</dt>
          <dd className="mt-0.5 truncate font-mono text-ink/90">
            {store.plugintype || "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-muted">Scope</dt>
          <dd className="mt-0.5">{store.shared ? "Shared" : "Node-local"}</dd>
        </div>
      </dl>

      {contents.length > 0 ? (
        <div className="mt-4 flex min-w-0 flex-wrap gap-1.5">
          {contents.map((label) => (
            <span
              key={label}
              className="rounded-md border border-line bg-bg/60 px-2 py-0.5 text-[11px] text-muted"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
