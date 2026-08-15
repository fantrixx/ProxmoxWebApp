import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { GuestCard } from "../components/GuestCard";
import { CreateGuestDialog } from "../components/CreateGuestDialog";
import { UpdateBanner } from "../components/UpdateBanner";
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
      <div className="space-y-6 px-4 py-4 md:space-y-8 md:px-8 md:py-6">
        <UpdateBanner canUpdate />

        {q.isError ? (
          <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            {(q.error as Error).message}
          </p>
        ) : null}

        <section id="overview-guests" className="scroll-mt-28 md:scroll-mt-32">
          <div className="sticky top-16 z-30 -mx-4 mb-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur md:top-20 md:-mx-8 md:px-8">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-muted">Container & VMs</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted">
                    {q.isLoading
                      ? "Loading…"
                      : `Showing ${filtered.length} of ${view.guests.length} guests`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateType("lxc")}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2 sm:min-h-0"
                  >
                    <Plus className="size-3.5" />
                    New CT
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateType("qemu")}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-black hover:bg-accent-2 sm:min-h-0"
                  >
                    <Plus className="size-3.5" />
                    New VM
                  </button>
                </div>
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
