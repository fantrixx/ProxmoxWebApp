import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Header } from "../components/Header";
import { GuestCard } from "../components/GuestCard";
import { UpdateBanner } from "../components/UpdateBanner";
import { useGuestRates, useResources } from "../hooks";
import { cpuPct } from "../format";
import type { ClusterResource, GuestType } from "../types";

const FILTERS_KEY = "proxpanel.overview.filters";

type GuestKindFilter = "all" | GuestType;

type OverviewFilters = {
  qtext: string;
  onlyRunning: boolean;
  kind: GuestKindFilter;
};

const defaultFilters: OverviewFilters = {
  qtext: "",
  onlyRunning: false,
  kind: "all",
};

function loadFilters(): OverviewFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return defaultFilters;
    const parsed = JSON.parse(raw) as Partial<OverviewFilters>;
    const kind =
      parsed.kind === "lxc" || parsed.kind === "qemu" || parsed.kind === "all"
        ? parsed.kind
        : "all";
    return {
      qtext: typeof parsed.qtext === "string" ? parsed.qtext : "",
      onlyRunning: Boolean(parsed.onlyRunning),
      kind,
    };
  } catch {
    return defaultFilters;
  }
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Dashboard() {
  const q = useResources();
  const [filters, setFilters] = useState<OverviewFilters>(() => loadFilters());

  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

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

  const filtered = useMemo(() => {
    return view.guests.filter((g) => {
      if (filters.onlyRunning && g.status !== "running") return false;
      if (filters.kind !== "all" && g.type !== filters.kind) return false;
      const hay =
        `${g.name} ${g.vmid} ${g.node} ${g.type} ${(g.ips || []).join(" ")}`.toLowerCase();
      return hay.includes(filters.qtext.trim().toLowerCase());
    });
  }, [view.guests, filters]);

  const filtersActive =
    filters.onlyRunning ||
    filters.kind !== "all" ||
    filters.qtext.trim().length > 0;

  function clearFilters() {
    setFilters(defaultFilters);
  }

  function focusGuestsRunning() {
    setFilters((f) => ({ ...f, onlyRunning: true }));
    requestAnimationFrame(() => scrollToId("overview-guests"));
  }

  return (
    <div>
      <Header
        title="Overview"
        subtitle={
          q.data?.version
            ? `${view.clusterName} · Proxmox VE ${q.data.version.version}`
            : view.clusterName
        }
      />
      <div className="space-y-6 px-4 py-4 md:space-y-8 md:px-8 md:py-6">
        <UpdateBanner />

        {q.isError ? (
          <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            {(q.error as Error).message}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat
            title="Guests"
            value={`${view.running} / ${view.guests.length}`}
            hint="running / total · click to show running"
            onClick={focusGuestsRunning}
          />
          <Stat
            title="Nodes"
            value={String(view.nodes.length)}
            hint="in cluster · see sidebar"
          />
          <Stat
            title="CPU Cluster"
            value={avgCpu(view.nodes)}
            hint="Average across all nodes"
          />
        </section>

        <section id="overview-guests" className="scroll-mt-28 md:scroll-mt-32">
          <div className="sticky top-16 z-30 -mx-4 mb-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur md:top-20 md:-mx-8 md:px-8">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-muted">Container & VMs</h2>
                <p className="text-xs text-muted">
                  {q.isLoading
                    ? "Loading…"
                    : `Showing ${filtered.length} of ${view.guests.length} guests`}
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                  <input
                    value={filters.qtext}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, qtext: e.target.value }))
                    }
                    placeholder="Search…"
                    className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-base outline-none focus:border-accent md:text-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <KindChip
                    active={filters.kind === "all"}
                    onClick={() => setFilters((f) => ({ ...f, kind: "all" }))}
                  >
                    All
                  </KindChip>
                  <KindChip
                    active={filters.kind === "lxc"}
                    onClick={() => setFilters((f) => ({ ...f, kind: "lxc" }))}
                  >
                    CTs
                  </KindChip>
                  <KindChip
                    active={filters.kind === "qemu"}
                    onClick={() => setFilters((f) => ({ ...f, kind: "qemu" }))}
                  >
                    VMs
                  </KindChip>
                  <label className="ml-1 flex min-h-11 items-center gap-2 text-sm text-muted sm:min-h-0">
                    <input
                      type="checkbox"
                      checked={filters.onlyRunning}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          onlyRunning: e.target.checked,
                        }))
                      }
                      className="accent-accent"
                    />
                    Running only
                  </label>
                </div>
              </div>
            </div>
          </div>

          {q.isLoading ? (
            <p className="text-sm text-muted">Loading resources…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface/40 px-4 py-8 text-center">
              <p className="text-sm text-muted">
                {filtersActive
                  ? filters.onlyRunning && !filters.qtext.trim() && filters.kind === "all"
                    ? "No running guests."
                    : "No guests match these filters."
                  : "No guests found."}
              </p>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2 sm:min-h-0 sm:py-1.5"
                >
                  Show all
                </button>
              ) : null}
            </div>
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

function KindChip({
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
      className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium sm:min-h-0 sm:py-1.5 ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  title,
  value,
  hint,
  onClick,
}: {
  title: string;
  value: string;
  hint: string;
  onClick?: () => void;
}) {
  const className =
    "rounded-2xl border border-line bg-surface p-5 text-left transition";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} cursor-pointer hover:border-line-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`}
      >
        <div className="text-xs text-muted">{title}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-muted">{hint}</div>
      </button>
    );
  }
  return (
    <div className={className}>
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
