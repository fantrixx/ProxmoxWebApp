import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Header } from "../components/Header";
import { GuestCard } from "../components/GuestCard";
import { MetricBar } from "../components/MetricBar";
import { StatusBadge } from "../components/StatusBadge";
import { useGuestRates, useResources } from "../hooks";
import {
  cpuPct,
  formatBytes,
  formatUptime,
  usagePct,
} from "../format";
import type { ClusterResource } from "../types";

export default function Dashboard() {
  const q = useResources();
  const [qtext, setQtext] = useState("");

  const resources = q.data?.resources;
  const rates = useGuestRates(resources);

  const view = useMemo(() => {
    const list = resources || [];
    const nodes = list.filter((r) => r.type === "node");
    const guests = list.filter(
      (r) => (r.type === "lxc" || r.type === "qemu") && !r.template,
    );
    const running = guests.filter((g) => g.status === "running").length;
    const cluster = q.data?.cluster || [];
    const clusterName =
      cluster.find((c) => c.type === "cluster")?.name || nodes[0]?.node || "Cluster";
    return { nodes, guests, running, clusterName };
  }, [resources, q.data?.cluster]);

  const filtered = view.guests.filter((g) => {
    const hay = `${g.name} ${g.vmid} ${g.node} ${g.type} ${(g.ips || []).join(" ")}`.toLowerCase();
    return hay.includes(qtext.trim().toLowerCase());
  });

  return (
    <div>
      <Header
        title="Übersicht"
        subtitle={
          q.data?.version
            ? `${view.clusterName} · Proxmox VE ${q.data.version.version}`
            : view.clusterName
        }
      />
      <div className="space-y-6 px-4 py-4 md:space-y-8 md:px-8 md:py-6">
        {q.isError ? (
          <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            {(q.error as Error).message}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat title="Gäste" value={`${view.running} / ${view.guests.length}`} hint="laufen / gesamt" />
          <Stat title="Nodes" value={String(view.nodes.length)} hint="im Cluster" />
          <Stat
            title="CPU Cluster"
            value={avgCpu(view.nodes)}
            hint="Mittel über alle Nodes"
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted">Nodes</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {view.nodes.map((node) => (
              <NodeCard key={node.id} node={node} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-medium text-muted">Container & VMs</h2>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                value={qtext}
                onChange={(e) => setQtext(e.target.value)}
                placeholder="Suchen…"
                className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-base outline-none focus:border-accent md:text-sm"
              />
            </div>
          </div>
          {q.isLoading ? (
            <p className="text-sm text-muted">Lade Ressourcen…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted">Keine Gäste gefunden.</p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((g) => (
                <GuestCard key={g.id} guest={g} rates={rates.get(g.id)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="text-xs text-muted">{title}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function avgCpu(nodes: ClusterResource[]): string {
  if (!nodes.length) return "—";
  const avg = nodes.reduce((s, n) => s + (n.cpu || 0), 0) / nodes.length;
  return `${cpuPct(avg).toFixed(1)} %`;
}

function NodeCard({ node }: { node: ClusterResource }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-semibold">{node.node}</div>
          <div className="text-xs text-muted">{formatUptime(node.uptime)}</div>
        </div>
        <StatusBadge status={node.status === "unknown" ? "offline" : node.status || "online"} />
      </div>
      <div className="space-y-3">
        <MetricBar
          label="CPU"
          percent={cpuPct(node.cpu)}
          detail={`${cpuPct(node.cpu).toFixed(1)} % · ${node.maxcpu || "?"} Kerne`}
        />
        <MetricBar
          label="RAM"
          percent={usagePct(node.mem, node.maxmem)}
          detail={`${formatBytes(node.mem)} / ${formatBytes(node.maxmem)}`}
        />
        <MetricBar
          label="Root-Disk"
          percent={usagePct(node.disk, node.maxdisk)}
          detail={`${formatBytes(node.disk)} / ${formatBytes(node.maxdisk)}`}
        />
      </div>
    </article>
  );
}
