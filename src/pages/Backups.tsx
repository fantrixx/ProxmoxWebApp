import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, HardDriveDownload, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { dataApi } from "../api";
import { Header } from "../components/Header";
import { GuestTypeIcon } from "../components/GuestTypeIcon";
import { StatusBadge } from "../components/StatusBadge";
import { formatBytes, formatSnapTime, guestLabel } from "../format";
import type { BackupOverviewGuest, GuestType, MediaItem } from "../types";

type KindFilter = "all" | GuestType;
type SortDir = "desc" | "asc";

function backupFileOf(item: MediaItem): string {
  const idx = item.volid.indexOf(":");
  return idx >= 0 ? item.volid.slice(idx + 1) : item.volid;
}

function formatLabel(item: MediaItem | null | undefined): string {
  if (!item) return "—";
  if (item.format) return item.format;
  const file = backupFileOf(item);
  const m = /\.(vma\.(zst|lzo|gz)|tar\.(zst|lzo|gz|bz2)|tgz|zst|gz|lzo)$/i.exec(file);
  return m ? m[0].replace(/^\./, "") : "—";
}

export default function BackupsPage() {
  const [kind, setKind] = useState<KindFilter>("all");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [qtext, setQtext] = useState("");
  const [selected, setSelected] = useState<BackupOverviewGuest | null>(null);

  const q = useQuery({
    queryKey: ["backupsOverview"],
    queryFn: () => dataApi.backupsOverview(),
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    let list = q.data?.guests || [];
    if (kind !== "all") list = list.filter((g) => g.type === kind);
    const needle = qtext.trim().toLowerCase();
    if (needle) {
      list = list.filter((g) =>
        `${g.name} ${g.vmid} ${g.node}`.toLowerCase().includes(needle),
      );
    }
    return [...list].sort((a, b) => {
      const at = a.lastBackup?.ctime ?? (sortDir === "desc" ? -1 : Number.MAX_SAFE_INTEGER);
      const bt = b.lastBackup?.ctime ?? (sortDir === "desc" ? -1 : Number.MAX_SAFE_INTEGER);
      if (at === bt) {
        return (a.name || "").localeCompare(b.name || "");
      }
      return sortDir === "desc" ? bt - at : at - bt;
    });
  }, [q.data, kind, qtext, sortDir]);

  const withBackup = (q.data?.guests || []).filter((g) => g.lastBackup).length;

  return (
    <div>
      <Header
        title="Backups"
        subtitle={
          q.isLoading
            ? "Loading backup overview…"
            : `${withBackup} of ${(q.data?.guests || []).length} guests have a backup`
        }
      />

      <div className="px-4 py-4 md:px-8 md:py-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={qtext}
              onChange={(e) => setQtext(e.target.value)}
              placeholder="Search name, VMID, node…"
              className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-base outline-none focus:border-accent md:text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <KindChip active={kind === "all"} onClick={() => setKind("all")}>
              All
            </KindChip>
            <KindChip active={kind === "lxc"} onClick={() => setKind("lxc")}>
              CTs
            </KindChip>
            <KindChip active={kind === "qemu"} onClick={() => setKind("qemu")}>
              VMs
            </KindChip>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-muted hover:bg-surface-2 hover:text-ink sm:min-h-0 sm:py-1.5"
              title="Sort by last backup date"
            >
              <ArrowDownUp className="size-3.5" />
              {sortDir === "desc" ? "Newest first" : "Oldest first"}
            </button>
          </div>
        </div>

        {q.isError ? (
          <p className="text-sm text-bad">{(q.error as Error).message}</p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted">Scanning backup storages…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">No guests match these filters.</p>
        ) : (
          <>
            <div className="mb-2 hidden text-[11px] text-muted md:grid md:grid-cols-[minmax(0,1.4fr)_5.5rem_7.5rem_5rem_6.5rem_minmax(0,1fr)] md:gap-3 md:px-3">
              <span>Guest</span>
              <span>Type</span>
              <span>Last backup</span>
              <span>Format</span>
              <span>Size</span>
              <span>Location</span>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {rows.map((row) => (
                <li key={`${row.type}-${row.node}-${row.vmid}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="grid w-full gap-2 px-3 py-3 text-left transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 md:grid-cols-[minmax(0,1.4fr)_5.5rem_7.5rem_5rem_6.5rem_minmax(0,1fr)] md:items-center md:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <GuestTypeIcon type={row.type} className="size-3.5" />
                        <span className="truncate font-medium">{row.name}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                        <span>
                          {guestLabel(row.type)} {row.vmid} · {row.node}
                        </span>
                        <StatusBadge status={row.status} />
                      </div>
                    </div>
                    <div className="text-xs text-muted md:text-sm md:text-ink">
                      <span className="md:hidden text-muted">Type · </span>
                      {guestLabel(row.type)}
                    </div>
                    <div className="text-xs md:text-sm">
                      <span className="md:hidden text-muted">Last · </span>
                      {row.lastBackup?.ctime
                        ? formatSnapTime(row.lastBackup.ctime)
                        : "Never"}
                    </div>
                    <div className="font-mono text-xs text-muted md:text-ink/80">
                      <span className="md:hidden">Format · </span>
                      {formatLabel(row.lastBackup)}
                    </div>
                    <div className="font-mono text-xs md:text-sm">
                      <span className="md:hidden text-muted">Size · </span>
                      {row.lastBackup ? formatBytes(row.lastBackup.size) : "—"}
                    </div>
                    <div className="min-w-0 text-xs text-muted md:text-sm">
                      <span className="md:hidden">Where · </span>
                      {row.lastBackup ? (
                        <span className="truncate">
                          <span className="font-mono text-ink/80">
                            {row.lastBackup.storage}
                          </span>
                          {row.lastBackup.node ? ` @ ${row.lastBackup.node}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {selected ? (
        <BackupOverviewDialog guest={selected} onClose={() => setSelected(null)} />
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

function BackupOverviewDialog({
  guest,
  onClose,
}: {
  guest: BackupOverviewGuest;
  onClose: () => void;
}) {
  const backup = guest.lastBackup;
  const history = useQuery({
    queryKey: ["guestBackups", guest.node, guest.type, String(guest.vmid)],
    queryFn: () => dataApi.guestBackups(guest.node, guest.type, String(guest.vmid)),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const others = useMemo(() => {
    const list = [...(history.data?.backups || [])].sort(
      (a, b) => (b.ctime || 0) - (a.ctime || 0),
    );
    if (!backup?.volid) return list;
    return list.filter((b) => b.volid !== backup.volid);
  }, [history.data, backup?.volid]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <div className="flex max-h-[min(90dvh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight">
                Backup details
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted">
                {guest.name} · {guestLabel(guest.type)} {guest.vmid} on {guest.node}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink sm:min-h-0 sm:min-w-0"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {!backup ? (
            <div className="rounded-xl border border-dashed border-line bg-bg/40 px-4 py-8 text-center">
              <HardDriveDownload className="mx-auto size-8 text-muted" />
              <p className="mt-3 text-sm font-medium">No backup yet</p>
              <p className="mt-1 text-xs text-muted">
                This guest has no backup on any configured backup storage.
              </p>
            </div>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="When" value={formatSnapTime(backup.ctime)} />
              <Detail label="Size" value={formatBytes(backup.size)} />
              <Detail label="Format" value={formatLabel(backup)} />
              <Detail
                label="Location"
                value={`${backup.storage}${backup.node ? ` @ ${backup.node}` : ""}`}
              />
              <Detail
                label="File"
                value={backupFileOf(backup)}
                mono
                className="sm:col-span-2"
              />
              {backup.notes ? (
                <Detail label="Notes" value={backup.notes} className="sm:col-span-2" />
              ) : null}
              <Detail
                label="Volume"
                value={backup.volid}
                mono
                className="sm:col-span-2"
              />
            </dl>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-muted">Other backups</h3>
              <span className="text-[11px] text-muted">
                {guest.backupCount} total
              </span>
            </div>
            {history.isLoading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : history.isError ? (
              <p className="text-sm text-bad">{(history.error as Error).message}</p>
            ) : others.length === 0 ? (
              <p className="text-sm text-muted">
                {backup ? "No older backups." : "No backups found."}
              </p>
            ) : (
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {others.map((item) => (
                  <li key={item.volid} className="px-3 py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{formatSnapTime(item.ctime)}</p>
                        <p className="mt-0.5 truncate text-muted">
                          <span className="font-mono">{item.storage}</span>
                          {item.node ? ` @ ${item.node}` : ""} · {formatLabel(item)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-muted">
                        {formatBytes(item.size)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2 sm:min-h-0"
          >
            Close
          </button>
          <Link
            to={`/guest/${guest.type}/${encodeURIComponent(guest.node)}/${guest.vmid}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-2 sm:min-h-0"
            onClick={onClose}
          >
            Open guest
          </Link>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  className = "",
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd
        className={`mt-0.5 break-all text-sm ${mono ? "font-mono text-ink/90" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
