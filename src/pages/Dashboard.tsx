import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Store } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { GuestCard } from "../components/GuestCard";
import { CreateGuestDialog } from "../components/CreateGuestDialog";
import { useGuestRates, useResources } from "../hooks";
import type { GuestType } from "../types";

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
  const location = useLocation();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<OverviewFilters>(() => loadFilters());
  const [createType, setCreateType] = useState<GuestType | null>(null);

  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

  // Cluster status bar deep-link: /?running=1
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("running") !== "1") return;
    setFilters((f) => ({ ...f, onlyRunning: true }));
    navigate("/", { replace: true });
    requestAnimationFrame(() => scrollToId("overview-guests"));
  }, [location.search, navigate]);

  const resources = q.data?.resources;
  const rates = useGuestRates(resources);

  const view = useMemo(() => {
    const list = resources || [];
    const nodes = list.filter((r) => r.type === "node");
    const guests = list.filter(
      (r) => (r.type === "lxc" || r.type === "qemu") && !r.template,
    );
    const cluster = q.data?.cluster || [];
    const clusterName =
      cluster.find((c) => c.type === "cluster")?.name || nodes[0]?.node || "Cluster";
    return { nodes, guests, clusterName };
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

  return (
    <div>
      <Header
        title="Overview"
        subtitle={
          [
            view.clusterName,
            q.data?.version ? `Proxmox VE ${q.data.version.version}` : null,
            view.nodes.length
              ? `${view.nodes.length} ${view.nodes.length === 1 ? "node" : "nodes"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
      />
      <div className="space-y-4 px-4 py-3 md:space-y-8 md:px-8 md:py-6">
        {q.isError ? (
          <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            {(q.error as Error).message}
          </p>
        ) : null}

        <section id="overview-guests" className="scroll-mt-20 md:scroll-mt-28">
          <div className="sticky top-12 z-30 -mx-4 mb-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur md:top-20 md:-mx-8 md:mb-3 md:px-8 md:py-2.5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
                  <input
                    value={filters.qtext}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, qtext: e.target.value }))
                    }
                    placeholder="Search containers…"
                    className="w-full rounded-lg border border-line bg-surface py-1.5 pr-2 pl-8 text-sm outline-none focus:border-accent md:py-2 md:pl-9"
                  />
                </div>
                <Link
                  to="/marketplace"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs font-medium hover:bg-surface-2 md:px-2.5"
                  title="Marketplace"
                >
                  <Store className="size-3.5" />
                  <span className="hidden sm:inline">Apps</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setCreateType("lxc")}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs font-medium hover:bg-surface-2 md:px-2.5"
                >
                  <Plus className="size-3.5" />
                  <span className="hidden sm:inline">New </span>CT
                </button>
                <button
                  type="button"
                  onClick={() => setCreateType("qemu")}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2 py-1.5 text-xs font-medium text-black hover:bg-accent-2 md:px-2.5"
                >
                  <Plus className="size-3.5" />
                  <span className="hidden sm:inline">New </span>VM
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
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
                <label className="ml-0.5 flex items-center gap-1.5 text-xs text-muted">
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
                  Running
                </label>
                <span className="ml-auto text-[11px] tabular-nums text-muted">
                  {q.isLoading
                    ? "…"
                    : `${filtered.length}/${view.guests.length}`}
                </span>
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
                    ? "No running containers."
                    : "No containers match these filters."
                  : "No containers found."}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {filtersActive ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2 sm:min-h-0 sm:py-1.5"
                  >
                    Show all
                  </button>
                ) : null}
                {!filtersActive ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCreateType("lxc")}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2 sm:min-h-0 sm:py-1.5"
                    >
                      <Plus className="size-3.5" />
                      New CT
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateType("qemu")}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black hover:bg-accent-2 sm:min-h-0 sm:py-1.5"
                    >
                      <Plus className="size-3.5" />
                      New VM
                    </button>
                  </>
                ) : null}
              </div>
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

      {createType ? (
        <CreateGuestDialog
          open
          initialType={createType}
          onClose={() => setCreateType(null)}
        />
      ) : null}
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
