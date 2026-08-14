import { useMemo } from "react";
import { Header } from "../components/Header";
import { MetricBar } from "../components/MetricBar";
import { useResources } from "../hooks";
import { formatBytes, usagePct } from "../format";

export default function StoragePage() {
  const q = useResources();
  const stores = useMemo(
    () => (q.data?.resources || []).filter((r) => r.type === "storage"),
    [q.data],
  );

  return (
    <div>
      <Header title="Speicher" subtitle={`${stores.length} Speicherpools`} />
      <div className="px-4 py-4 md:px-8 md:py-6">
        {q.isError ? (
          <p className="text-sm text-bad">{(q.error as Error).message}</p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted">Lade Speicher…</p>
        ) : stores.length === 0 ? (
          <p className="text-sm text-muted">Keine Speicher gefunden.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {stores.map((s) => (
              <article key={s.id} className="rounded-2xl border border-line bg-surface p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{s.storage || s.id}</div>
                    <div className="text-xs text-muted">
                      {s.node || "shared"}
                      {s.plugintype ? ` · ${s.plugintype}` : ""}
                      {s.shared ? " · shared" : ""}
                    </div>
                  </div>
                  <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] text-muted">
                    {s.status || "ok"}
                  </span>
                </div>
                <MetricBar
                  label="Belegung"
                  percent={usagePct(s.disk, s.maxdisk)}
                  detail={`${formatBytes(s.disk)} / ${formatBytes(s.maxdisk)}`}
                />
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
