import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useResources } from "../hooks";
import { guestLabel } from "../format";
import type { ClusterResource, GuestType } from "../types";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const resources = useResources();

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return { guests: [] as ClusterResource[], storages: [] as ClusterResource[] };
    const list = resources.data?.resources || [];
    const guests = list
      .filter((r) => (r.type === "lxc" || r.type === "qemu") && !r.template)
      .filter((g) =>
        `${g.name} ${g.vmid} ${g.node} ${(g.ips || []).join(" ")}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 8);
    const storages = list
      .filter((r) => r.type === "storage")
      .filter((s) =>
        `${s.storage} ${s.node} ${s.plugintype} ${s.content}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 5);
    return { guests, storages };
  }, [q, resources.data?.resources]);

  function goGuest(g: ClusterResource) {
    const type = (g.type === "qemu" ? "qemu" : "lxc") as GuestType;
    if (!g.node || g.vmid == null) return;
    setOpen(false);
    setQ("");
    navigate(`/guest/${type}/${encodeURIComponent(g.node)}/${g.vmid}`);
  }

  function goStorage(s: ClusterResource) {
    setOpen(false);
    setQ("");
    navigate(`/storage?q=${encodeURIComponent(s.storage || s.id)}`);
  }

  function goTasks() {
    setOpen(false);
    setQ("");
    navigate("/tasks");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line p-1.5 text-muted hover:bg-surface-2 hover:text-ink md:p-2"
        title="Search"
        aria-label="Search"
      >
        <Search className="size-4" />
      </button>
    );
  }

  return (
    <div className="relative z-50">
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default bg-black/40 md:bg-transparent"
        aria-label="Close search"
        onClick={() => {
          setOpen(false);
          setQ("");
        }}
      />
      <div className="fixed inset-x-3 top-14 z-50 rounded-xl border border-line bg-surface shadow-2xl md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-80">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Containers, storage…"
            className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setQ("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQ("");
            }}
            className="rounded p-1 text-muted hover:bg-surface-2"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {!q.trim() ? (
            <p className="px-3 py-2 text-xs text-muted">Type to search containers or storage.</p>
          ) : (
            <>
              {results.guests.length > 0 ? (
                <div>
                  <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Containers
                  </p>
                  {results.guests.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => goGuest(g)}
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-surface-2"
                    >
                      <span className="truncate text-sm font-medium">
                        {g.name || `Guest ${g.vmid}`}
                      </span>
                      <span className="truncate text-[11px] text-muted">
                        {guestLabel((g.type === "qemu" ? "qemu" : "lxc") as GuestType)}{" "}
                        {g.vmid} · {g.node}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {results.storages.length > 0 ? (
                <div>
                  <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Storage
                  </p>
                  {results.storages.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => goStorage(s)}
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-surface-2"
                    >
                      <span className="truncate text-sm font-medium">
                        {s.storage || s.id}
                      </span>
                      <span className="truncate text-[11px] text-muted">{s.node}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {results.guests.length === 0 && results.storages.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted">No matches.</p>
              ) : null}
              <button
                type="button"
                onClick={goTasks}
                className="w-full border-t border-line px-3 py-2 text-left text-xs text-muted hover:bg-surface-2 hover:text-ink"
              >
                Open Tasks
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
