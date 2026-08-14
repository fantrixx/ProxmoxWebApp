import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Header } from "../components/Header";
import { GuestCard } from "../components/GuestCard";
import { useGuestRates, useResources } from "../hooks";
import type { GuestType } from "../types";

export default function GuestList({ kind }: { kind: GuestType }) {
  const q = useResources();
  const [qtext, setQtext] = useState("");
  const [onlyRunning, setOnlyRunning] = useState(false);

  const resources = q.data?.resources;
  const rates = useGuestRates(resources);

  const guests = useMemo(() => {
    return (resources || []).filter((r) => r.type === kind && !r.template);
  }, [resources, kind]);

  const filtered = guests.filter((g) => {
    if (onlyRunning && g.status !== "running") return false;
    const hay = `${g.name} ${g.vmid} ${g.node} ${(g.ips || []).join(" ")}`.toLowerCase();
    return hay.includes(qtext.trim().toLowerCase());
  });

  const title = kind === "lxc" ? "Container" : "Virtuelle Maschinen";
  const running = guests.filter((g) => g.status === "running").length;

  return (
    <div>
      <Header
        title={title}
        subtitle={`${running} von ${guests.length} laufen`}
      />
      <div className="px-8 py-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" />
            <input
              value={qtext}
              onChange={(e) => setQtext(e.target.value)}
              placeholder="Name oder VMID…"
              className="w-72 rounded-xl border border-line bg-surface py-2 pr-3 pl-9 text-sm outline-none focus:border-accent"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={onlyRunning}
              onChange={(e) => setOnlyRunning(e.target.checked)}
              className="accent-accent"
            />
            Nur laufende
          </label>
        </div>

        {q.isError ? (
          <p className="text-sm text-bad">{(q.error as Error).message}</p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted">Lade…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">Keine Einträge.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((g) => (
                <GuestCard key={g.id} guest={g} rates={rates.get(g.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
