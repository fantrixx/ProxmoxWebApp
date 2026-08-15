import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, CalendarClock, HardDriveDownload, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { dataApi } from "../api";
import { Header } from "../components/Header";
import { BackupDialog } from "../components/BackupDialog";
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
  const qc = useQueryClient();
  const [kind, setKind] = useState<KindFilter>("all");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [qtext, setQtext] = useState("");
  const [selected, setSelected] = useState<BackupOverviewGuest | null>(null);
  const [backupTarget, setBackupTarget] = useState<BackupOverviewGuest | null>(null);

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
  const withSchedule = (q.data?.guests || []).filter(
    (g) => g.enabledBackupScheduleCount > 0,
  ).length;

  function openBackupNow(guest: BackupOverviewGuest) {
    setSelected(null);
    setBackupTarget(guest);
  }

  function closeBackupDialog() {
    setBackupTarget(null);
    void qc.invalidateQueries({ queryKey: ["backupsOverview"] });
    void qc.invalidateQueries({ queryKey: ["guestBackups"] });
  }

  return (
    <div className="max-w-full overflow-x-hidden">
      <Header
        title="Backups"
        subtitle={
          q.isLoading
            ? "Loading backup overview…"
            : `${withBackup} of ${(q.data?.guests || []).length} guests have a backup · ${withSchedule} scheduled`
        }
      />

      <div className="max-w-full px-4 py-4 md:px-8 md:py-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full min-w-0 lg:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={qtext}
              onChange={(e) => setQtext(e.target.value)}
              placeholder="Search name, VMID, node…"
              className="w-full min-w-0 rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-base outline-none focus:border-accent md:text-sm"
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
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
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-muted hover:bg-surface-2 hover:text-ink sm:min-h-0 sm:py-1.5"
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
            <div className="mb-2 hidden text-[11px] text-muted lg:grid lg:grid-cols-[minmax(0,1.15fr)_3.5rem_6.5rem_minmax(0,0.9fr)_4rem_5rem_minmax(0,0.75fr)_7rem] lg:gap-3 lg:px-3">
              <span>Guest</span>
              <span>Type</span>
              <span>Last backup</span>
              <span>Schedule</span>
              <span>Format</span>
              <span>Size</span>
              <span>Location</span>
              <span className="text-right">Action</span>
            </div>
            <ul className="max-w-full divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {rows.map((row) => (
                <BackupRow
                  key={`${row.type}-${row.node}-${row.vmid}`}
                  row={row}
                  onOpenDetails={() => setSelected(row)}
                  onBackupNow={() => openBackupNow(row)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {selected ? (
        <BackupOverviewDialog
          guest={selected}
          onClose={() => setSelected(null)}
          onBackupNow={() => openBackupNow(selected)}
        />
      ) : null}

      {backupTarget ? (
        <BackupDialog
          open
          onClose={closeBackupDialog}
          node={backupTarget.node}
          type={backupTarget.type}
          vmid={backupTarget.vmid}
          name={backupTarget.name}
        />
      ) : null}
    </div>
  );
}

function BackupRow({
  row,
  onOpenDetails,
  onBackupNow,
}: {
  row: BackupOverviewGuest;
  onOpenDetails: () => void;
  onBackupNow: () => void;
}) {
  return (
    <li className="min-w-0">
      <div className="flex min-w-0 flex-col gap-3 px-3 py-3 transition hover:bg-surface-2/50 lg:grid lg:grid-cols-[minmax(0,1.15fr)_3.5rem_6.5rem_minmax(0,0.9fr)_4rem_5rem_minmax(0,0.75fr)_7rem] lg:items-center lg:gap-3">
        <button
          type="button"
          onClick={onOpenDetails}
          className="min-w-0 cursor-pointer overflow-hidden text-left lg:contents"
        >
          <div className="min-w-0 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2">
              <GuestTypeIcon type={row.type} className="size-3.5 shrink-0" />
              <span className="truncate font-medium">{row.name}</span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="truncate">
                {guestLabel(row.type)} {row.vmid} · {row.node}
              </span>
              <StatusBadge status={row.status} />
            </div>
          </div>

          <div className="mt-2 min-w-0 space-y-1 text-xs text-muted lg:hidden">
            <div className="flex min-w-0 justify-between gap-3">
              <span>Last backup</span>
              <span className="truncate text-ink">
                {row.lastBackup?.ctime ? formatSnapTime(row.lastBackup.ctime) : "Never"}
              </span>
            </div>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <span>Schedule</span>
              <ScheduleBadge guest={row} align="end" />
            </div>
            <div className="flex min-w-0 justify-between gap-3">
              <span>Format / size</span>
              <span className="truncate font-mono text-ink/90">
                {formatLabel(row.lastBackup)}
                {row.lastBackup ? ` · ${formatBytes(row.lastBackup.size)}` : ""}
              </span>
            </div>
            <div className="flex min-w-0 justify-between gap-3">
              <span>Where</span>
              <span className="truncate font-mono text-ink/90">
                {row.lastBackup
                  ? `${row.lastBackup.storage}${
                      row.lastBackup.node ? ` @ ${row.lastBackup.node}` : ""
                    }`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="hidden min-w-0 lg:block lg:text-sm">{guestLabel(row.type)}</div>
          <div className="hidden min-w-0 truncate lg:block lg:text-sm">
            {row.lastBackup?.ctime ? formatSnapTime(row.lastBackup.ctime) : "Never"}
          </div>
          <div className="hidden min-w-0 lg:block">
            <ScheduleBadge guest={row} />
          </div>
          <div className="hidden min-w-0 truncate font-mono text-ink/80 lg:block lg:text-xs">
            {formatLabel(row.lastBackup)}
          </div>
          <div className="hidden min-w-0 truncate font-mono lg:block lg:text-sm">
            {row.lastBackup ? formatBytes(row.lastBackup.size) : "—"}
          </div>
          <div className="hidden min-w-0 truncate text-sm lg:block">
            {row.lastBackup ? (
              <>
                <span className="font-mono text-ink/80">{row.lastBackup.storage}</span>
                {row.lastBackup.node ? ` @ ${row.lastBackup.node}` : ""}
              </>
            ) : (
              "—"
            )}
          </div>
        </button>

        <div className="flex shrink-0 lg:justify-end">
          <button
            type="button"
            onClick={onBackupNow}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/20 lg:min-h-0 lg:w-auto lg:py-1.5"
          >
            <HardDriveDownload className="size-3.5" />
            Backup now
          </button>
        </div>
      </div>
    </li>
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
      className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-xs font-medium sm:min-h-0 sm:py-1.5 ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function ScheduleBadge({
  guest,
  align = "start",
}: {
  guest: BackupOverviewGuest;
  align?: "start" | "end";
}) {
  if (!guest.hasBackupSchedule) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-muted ${
          align === "end" ? "text-right" : ""
        }`}
      >
        No schedule
      </span>
    );
  }

  const active = guest.enabledBackupScheduleCount > 0;
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        active ? "bg-accent/15 text-accent" : "bg-warn/15 text-warn"
      } ${align === "end" ? "justify-end text-right" : ""}`}
      title={guest.backupScheduleSummary || undefined}
    >
      <CalendarClock className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">
        {active ? "Scheduled" : "Paused"}
        {guest.backupScheduleSummary ? ` · ${guest.backupScheduleSummary}` : ""}
      </span>
    </span>
  );
}

function BackupOverviewDialog({
  guest,
  onClose,
  onBackupNow,
}: {
  guest: BackupOverviewGuest;
  onClose: () => void;
  onBackupNow: () => void;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <div className="flex max-h-[min(90dvh,820px)] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 overflow-hidden">
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
              className="min-h-11 min-w-11 shrink-0 cursor-pointer rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink sm:min-h-0 sm:min-w-0"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4">
          <div className="rounded-xl border border-line bg-bg/40 px-3 py-3">
            <p className="text-[11px] text-muted">Backup schedule</p>
            <div className="mt-1.5">
              <ScheduleBadge guest={guest} />
            </div>
            {!guest.hasBackupSchedule ? (
              <p className="mt-1.5 text-xs text-muted">
                Create one on the guest page under Power schedules (action: Backup).
              </p>
            ) : null}
          </div>

          {!backup ? (
            <div className="rounded-xl border border-dashed border-line bg-bg/40 px-4 py-8 text-center">
              <HardDriveDownload className="mx-auto size-8 text-muted" />
              <p className="mt-3 text-sm font-medium">No backup yet</p>
              <p className="mt-1 text-xs text-muted">
                This guest has no backup on any configured backup storage.
              </p>
            </div>
          ) : (
            <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
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

          <div className="min-w-0">
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
              <ul className="max-h-48 min-w-0 divide-y divide-line overflow-x-hidden overflow-y-auto rounded-xl border border-line">
                {others.map((item) => (
                  <li key={item.volid} className="min-w-0 px-3 py-2.5 text-xs">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 overflow-hidden">
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
            className="min-h-11 cursor-pointer rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2 sm:min-h-0"
          >
            Close
          </button>
          <Link
            to={`/guest/${guest.type}/${encodeURIComponent(guest.node)}/${guest.vmid}`}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2 sm:min-h-0"
            onClick={onClose}
          >
            Open guest
          </Link>
          <button
            type="button"
            onClick={onBackupNow}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-2 sm:min-h-0"
          >
            <HardDriveDownload className="size-3.5" />
            Backup now
          </button>
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
    <div className={`min-w-0 overflow-hidden ${className}`}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd
        className={`mt-0.5 break-all text-sm [overflow-wrap:anywhere] ${
          mono ? "font-mono text-ink/90" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
