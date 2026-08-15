import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useResources } from "../hooks";
import { cpuPct } from "../format";
import type { ClusterResource } from "../types";

export function ClusterStatusBar() {
  const q = useResources();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const list = q.data?.resources || [];
    const nodes = list.filter((r) => r.type === "node");
    const guests = list.filter(
      (r) => (r.type === "lxc" || r.type === "qemu") && !r.template,
    );
    const running = guests.filter((g) => g.status === "running").length;
    return {
      running,
      total: guests.length,
      cpu: avgCpu(nodes),
    };
  }, [q.data?.resources]);

  function showRunningGuests() {
    navigate("/?running=1");
  }

  const loading = q.isLoading && !q.data;
  const cpuPercent = stats.cpu.percent;

  return (
    <div className="shrink-0 border-b border-line bg-bg-2/80 px-3 py-2 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={showRunningGuests}
          title="Show running guests on Overview"
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-left transition hover:border-line-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:min-h-0 sm:px-3 sm:py-2"
        >
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted sm:text-[11px]">
            Guests
          </span>
          <span className="flex min-w-0 items-baseline gap-1.5 tabular-nums">
            <span className="text-base font-semibold text-good sm:text-lg">
              {loading ? "—" : stats.running}
            </span>
            <span className="text-[10px] text-muted sm:text-xs">running</span>
            <span className="text-muted/60">/</span>
            <span className="text-sm font-semibold text-ink/90 sm:text-base">
              {loading ? "—" : stats.total}
            </span>
            <span className="hidden text-[10px] text-muted sm:inline sm:text-xs">
              total
            </span>
          </span>
        </button>

        <div
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-1.5 sm:min-h-0 sm:px-3 sm:py-2"
          title="Average CPU across all nodes"
        >
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted sm:text-[11px]">
            CPU
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-base font-semibold tabular-nums sm:text-lg">
                {loading ? "—" : stats.cpu.label}
              </span>
              <span className="hidden text-[10px] text-muted sm:inline sm:text-xs">
                cluster avg
              </span>
            </span>
            {cpuPercent != null && Number.isFinite(cpuPercent) ? (
              <UsageBar percent={cpuPercent} />
            ) : (
              <div className="mt-1.5 h-1 rounded-full bg-bg sm:mt-2 sm:h-1.5" />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function UsageBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const tone =
    clamped >= 90 ? "bg-bad" : clamped >= 75 ? "bg-warn" : "bg-good";

  return (
    <div
      className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg sm:mt-2 sm:h-1.5"
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="CPU cluster usage"
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${tone}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function avgCpu(nodes: ClusterResource[]): { label: string; percent: number | null } {
  if (!nodes.length) return { label: "—", percent: null };
  const avg = nodes.reduce((s, n) => s + (n.cpu || 0), 0) / nodes.length;
  const percent = cpuPct(avg);
  return { label: `${percent.toFixed(1)} %`, percent };
}
