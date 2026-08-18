import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  Ellipsis,
  HardDriveDownload,
  Loader2,
  Play,
  Power,
  RotateCcw,
  TerminalSquare,
} from "lucide-react";
import type { ClusterResource, GuestRates, GuestType, MediaItem } from "../types";
import {
  cpuPct,
  formatBytes,
  formatBytesRate,
  formatSnapTime,
  formatUptime,
  guestLabel,
  guestVisualStatus,
  usagePct,
} from "../format";
import { dataApi } from "../api";
import { MetricBar } from "./MetricBar";
import { StatusBadge } from "./StatusBadge";
import { GuestTypeIcon } from "./GuestTypeIcon";
import { ServiceIcon } from "./ServiceIcon";
import { ConfirmDialog } from "./ConfirmDialog";
import { BackupDialog } from "./BackupDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { GuestQuickSheet } from "./GuestQuickSheet";
import { IpList } from "./IpList";
import { useApp } from "../context";
import { useGuestAction } from "../hooks";
import { useGuestBackupProgress } from "../hooks/useGuestBackupProgress";
import { POWER_CONFIRMS } from "../power";
import { reconcilePendingGuestAction } from "../pendingGuest";
import { resolveQuickBackup } from "../quickBackup";

type PowerKind = keyof typeof POWER_CONFIRMS;

export function GuestCard({
  guest,
  rates,
}: {
  guest: ClusterResource;
  rates?: GuestRates;
}) {
  const { openConsole, toast, startGuestBackup } = useApp();
  const action = useGuestAction();
  const [confirm, setConfirm] = useState<PowerKind | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const type = (guest.type === "qemu" ? "qemu" : "lxc") as GuestType;
  const pending = reconcilePendingGuestAction(
    guest.node,
    type,
    guest.vmid,
    guest.status,
    guest.qmpstatus,
  );
  const visual = guestVisualStatus({
    status: guest.status,
    qmpstatus: guest.qmpstatus,
    lock: guest.lock,
    pending,
  });
  const running = visual === "running";
  const transitioning =
    visual === "shutting down" ||
    visual === "stopping" ||
    visual === "starting" ||
    visual === "rebooting" ||
    visual === "creating" ||
    visual === "migrating";
  const busy = action.isPending || transitioning;
  const backup = useGuestBackupProgress(guest.node, guest.vmid);
  const backingUp = Boolean(backup?.running);
  const backupFailed = Boolean(backup?.failed);

  function run(kind: string) {
    if (!guest.node || guest.vmid == null) return;
    action.mutate(
      { node: guest.node, type, vmid: guest.vmid, action: kind },
      { onSuccess: () => setConfirm(null) },
    );
  }

  function shell() {
    if (!running) {
      toast("err", "Shell is only available for running containers.");
      return;
    }
    if (!guest.node || guest.vmid == null) return;
    openConsole({
      type,
      node: guest.node,
      vmid: guest.vmid,
      name: guest.name || String(guest.vmid),
    });
  }

  async function quickBackup() {
    if (!guest.node || guest.vmid == null || backupBusy || backingUp) return;
    setBackupBusy(true);
    setMenuOpen(false);
    try {
      const resolved = await resolveQuickBackup(
        guest.node,
        type,
        String(guest.vmid),
      );
      if (!resolved) {
        setBackupOpen(true);
        return;
      }
      await startGuestBackup({
        ...resolved,
        name: guest.name,
      });
    } catch {
      /* toasted */
    } finally {
      setBackupBusy(false);
    }
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function onCardPointerDown() {
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setMenuOpen(true);
    }, 450);
  }

  function onCardPointerUp() {
    clearLongPress();
  }

  const meta = confirm ? POWER_CONFIRMS[confirm] : null;

  return (
    <article
      onContextMenu={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("button, a, input, textarea")) return;
        e.preventDefault();
      }}
      onPointerDown={onCardPointerDown}
      onPointerUp={onCardPointerUp}
      onPointerLeave={onCardPointerUp}
      onPointerCancel={onCardPointerUp}
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-surface p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] md:p-5 ${
        backupFailed
          ? "border-bad/50"
          : backingUp
            ? "border-accent/50"
            : visual === "creating" || visual === "starting"
              ? "border-accent/40"
              : visual === "shutting down" ||
                  visual === "stopping" ||
                  visual === "rebooting"
                ? "border-warn/40"
                : "border-line"
      }`}
    >
      {backingUp || backupFailed ? (
        <div
          className={`absolute inset-x-0 top-0 h-1 ${
            backupFailed ? "bg-bad" : "bg-accent/30"
          }`}
        >
          {!backupFailed ? (
            <div
              className={`h-full bg-accent transition-[width] duration-500 ${
                backup?.progress == null ? "w-1/3 animate-pulse" : ""
              }`}
              style={
                backup?.progress != null ? { width: `${backup.progress}%` } : undefined
              }
            />
          ) : null}
        </div>
      ) : transitioning ? (
        <div
          className={`absolute inset-x-0 top-0 h-1 ${
            visual === "creating" || visual === "starting" || visual === "migrating"
              ? "bg-accent/40 animate-pulse"
              : "bg-warn/40 animate-pulse"
          }`}
        />
      ) : null}

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge
              status={guest.status}
              qmpstatus={guest.qmpstatus}
              lock={guest.lock}
              pending={pending}
            />
            <span className="inline-flex items-center gap-1 rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] text-muted">
              <GuestTypeIcon type={type} className="size-3" />
              {guestLabel(type)} {guest.vmid}
            </span>
            {transitioning && !backingUp ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
                  visual === "creating" ||
                  visual === "starting" ||
                  visual === "migrating"
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-warn/40 bg-warn/10 text-warn"
                }`}
              >
                <Loader2 className="size-3 animate-spin" aria-hidden />
                {visual === "creating" ? "Setting up…" : visual}
              </span>
            ) : null}
            {backingUp ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Backup {backup?.progress != null ? `${Math.round(backup.progress)}%` : "…"}
              </span>
            ) : null}
            {backupFailed ? (
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-bad/40 bg-bad/10 px-1.5 py-0.5 text-[11px] font-medium text-bad">
                Backup failed
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (longPressFired.current) return;
              setSheetOpen(true);
            }}
            className="flex min-w-0 items-center gap-2 text-left text-lg font-semibold tracking-tight hover:text-accent"
          >
            <span className="truncate">{guest.name || `Guest ${guest.vmid}`}</span>
          </button>
          <p className="mt-1 text-xs text-muted">
            Node {guest.node}
            {guest.maxcpu ? ` · ${guest.maxcpu} CPU` : ""}
            {running ? ` · ${formatUptime(guest.uptime)}` : ""}
          </p>
          <div className="mt-2">
            <IpList
              ips={guest.ips}
              name={guest.name}
              tags={guest.tags}
              guestType={type}
              node={guest.node}
              type={type}
              vmid={guest.vmid}
            />
          </div>
        </div>
        <ServiceIcon
          name={guest.name}
          tags={guest.tags}
          node={guest.node}
          type={type}
          vmid={guest.vmid}
          className="size-12"
        />
      </div>

      {backingUp ? (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-accent">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Backup in progress
            </span>
            <span className="tabular-nums text-muted">{backup?.label}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg">
            {backup?.progress == null ? (
              <div className="relative h-full w-full overflow-hidden">
                <div className="absolute inset-y-0 w-2/5 animate-[job-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
              </div>
            ) : (
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${backup.progress}%` }}
              />
            )}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <MetricBar
          label="CPU"
          percent={running ? cpuPct(guest.cpu) : 0}
          detail={running ? `${cpuPct(guest.cpu).toFixed(1)} %` : "—"}
        />
        <MetricBar
          label="RAM"
          percent={usagePct(guest.mem, guest.maxmem)}
          detail={`${formatBytes(guest.mem)} / ${formatBytes(guest.maxmem)}`}
        />
        <MetricBar
          label="Disk"
          percent={usagePct(guest.disk, guest.maxdisk)}
          detail={`${formatBytes(guest.disk)} / ${formatBytes(guest.maxdisk)}`}
        />
      </div>

      <div className="mt-4 flex gap-4 font-mono text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <ArrowDownToLine className="size-3" />
          {formatBytesRate(rates?.netin)}
        </span>
        <span className="inline-flex items-center gap-1">
          <ArrowUpFromLine className="size-3" />
          {formatBytesRate(rates?.netout)}
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {running ? (
          <>
            <ActionBtn
              icon={<Power className="size-3.5" />}
              label="Shut down"
              disabled={busy || backingUp}
              onClick={() => setConfirm("shutdown")}
            />
            <ActionBtn
              icon={<RotateCcw className="size-3.5" />}
              label="Restart"
              disabled={busy || backingUp}
              onClick={() => setConfirm("reboot")}
            />
          </>
        ) : (
          <ActionBtn
            icon={<Play className="size-3.5" />}
            label="Start"
            primary
            disabled={busy || backingUp}
            onClick={() => run("start")}
          />
        )}
        <ActionBtn
          icon={<TerminalSquare className="size-3.5" />}
          label="Shell"
          disabled={busy || !running || backingUp}
          onClick={shell}
        />
        <BackupActionBtn
          node={guest.node}
          type={type}
          vmid={guest.vmid}
          backingUp={backingUp || backupBusy}
          progress={backup?.progress}
          disabled={busy || backingUp || backupBusy || !guest.node || guest.vmid == null}
          onClick={() => void quickBackup()}
        />
        <div className="relative">
          <ActionBtn
            icon={<Ellipsis className="size-3.5" />}
            label="More"
            disabled={busy || !guest.node || guest.vmid == null}
            onClick={() => setMenuOpen((v) => !v)}
          />
          {menuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute bottom-full right-0 z-30 mb-1 min-w-40 overflow-hidden rounded-xl border border-line bg-bg py-1 shadow-xl">
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setScheduleOpen(true);
                  }}
                >
                  <CalendarClock className="size-3.5" /> Schedule
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setBackupOpen(true);
                  }}
                >
                  <HardDriveDownload className="size-3.5" /> Backup options…
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setSheetOpen(true);
                  }}
                >
                  Quick view
                </MenuItem>
                <Link
                  to={`/guest/${type}/${guest.node}/${guest.vmid}`}
                  className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-2"
                  onClick={() => setMenuOpen(false)}
                >
                  Full details
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {meta && confirm ? (
        <ConfirmDialog
          title={meta.title}
          body={`${guest.name || guest.vmid}: ${meta.body}`}
          confirmLabel={meta.confirm}
          danger={meta.danger}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      ) : null}

      {guest.node && guest.vmid != null ? (
        <BackupDialog
          open={backupOpen}
          onClose={() => setBackupOpen(false)}
          node={guest.node}
          type={type}
          vmid={guest.vmid}
          name={guest.name}
        />
      ) : null}

      {guest.node && guest.vmid != null ? (
        <ScheduleDialog
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          node={guest.node}
          type={type}
          vmid={guest.vmid}
          name={guest.name}
        />
      ) : null}

      <GuestQuickSheet
        guest={guest}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </article>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

function backupStorageOf(item: MediaItem): string {
  if (item.storage) return item.storage;
  const idx = item.volid.indexOf(":");
  return idx > 0 ? item.volid.slice(0, idx) : item.volid;
}

function BackupActionBtn({
  node,
  type,
  vmid,
  backingUp,
  progress,
  disabled,
  onClick,
}: {
  node?: string;
  type: GuestType;
  vmid?: number;
  backingUp: boolean;
  progress?: number | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const enabled = hover && Boolean(node) && vmid != null && !backingUp;

  const q = useQuery({
    queryKey: ["guestBackups", node, type, String(vmid)],
    queryFn: () => dataApi.guestBackups(node!, type, String(vmid)),
    enabled,
    staleTime: 60_000,
  });

  const last = useMemo(() => {
    const list = q.data?.backups || [];
    if (!list.length) return null;
    return [...list].sort((a, b) => (b.ctime || 0) - (a.ctime || 0))[0];
  }, [q.data]);

  const label = backingUp
    ? progress != null
      ? `${Math.round(progress)}%`
      : "Backup…"
    : "Backup";

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <ActionBtn
        icon={
          backingUp ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <HardDriveDownload className="size-3.5" />
          )
        }
        label={label}
        disabled={disabled}
        onClick={onClick}
      />
      {hover && !backingUp ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-xl border border-line bg-bg px-3 py-2 text-left text-xs shadow-xl"
        >
          <div className="mb-1 font-medium text-ink">Last backup</div>
          {q.isLoading ? (
            <p className="text-muted">Loading…</p>
          ) : q.isError ? (
            <p className="text-bad">{(q.error as Error).message}</p>
          ) : !last ? (
            <p className="text-muted">No backup yet</p>
          ) : (
            <div className="space-y-0.5 text-muted">
              <p>
                <span className="text-ink/80">When:</span> {formatSnapTime(last.ctime)}
              </p>
              <p>
                <span className="text-ink/80">Where:</span>{" "}
                <span className="font-mono text-ink/90">{backupStorageOf(last)}</span>
                {last.node ? ` @ ${last.node}` : ""}
              </p>
              {last.size != null ? (
                <p>
                  <span className="text-ink/80">Size:</span> {formatBytes(last.size)}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  primary,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const tone = primary
    ? "bg-accent text-black hover:bg-accent-2"
    : danger
      ? "border-bad/40 text-bad hover:bg-bad/10"
      : "border-line text-ink hover:border-line-2 hover:bg-surface-2";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-2.5 ${primary ? "border-transparent" : ""} ${tone}`}
    >
      {icon}
      {label}
    </button>
  );
}
