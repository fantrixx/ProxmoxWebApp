import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  HardDriveDownload,
  Loader2,
  Play,
  Power,
  RotateCcw,
  Square,
  TerminalSquare,
} from "lucide-react";
import type { ClusterResource, GuestRates, GuestType } from "../types";
import {
  cpuPct,
  formatBytes,
  formatBytesRate,
  formatUptime,
  guestLabel,
  usagePct,
} from "../format";
import { MetricBar } from "./MetricBar";
import { StatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { BackupDialog } from "./BackupDialog";
import { IpList } from "./IpList";
import { useApp } from "../context";
import { useGuestAction } from "../hooks";
import { useGuestBackupProgress } from "../hooks/useGuestBackupProgress";
import { POWER_CONFIRMS } from "../power";

type PowerKind = keyof typeof POWER_CONFIRMS;

export function GuestCard({
  guest,
  rates,
}: {
  guest: ClusterResource;
  rates?: GuestRates;
}) {
  const { openConsole, toast } = useApp();
  const action = useGuestAction();
  const [confirm, setConfirm] = useState<PowerKind | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const running = guest.status === "running";
  const type = (guest.type === "qemu" ? "qemu" : "lxc") as GuestType;
  const busy = action.isPending;
  const backup = useGuestBackupProgress(guest.node, guest.vmid);

  function run(kind: string) {
    if (!guest.node || guest.vmid == null) return;
    action.mutate(
      { node: guest.node, type, vmid: guest.vmid, action: kind },
      { onSuccess: () => setConfirm(null) },
    );
  }

  function shell() {
    if (!running) {
      toast("err", "Shell is only available for running guests.");
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

  const meta = confirm ? POWER_CONFIRMS[confirm] : null;
  const backingUp = Boolean(backup?.running);
  const backupFailed = Boolean(backup?.failed);

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-surface p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${
        backupFailed
          ? "border-bad/50"
          : backingUp
            ? "border-accent/50"
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
      ) : null}

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={guest.status} />
            <span className="rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {guestLabel(type)} {guest.vmid}
            </span>
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
          <Link
            to={`/guest/${type}/${guest.node}/${guest.vmid}`}
            className="text-lg font-semibold tracking-tight hover:text-accent"
          >
            {guest.name || `Guest ${guest.vmid}`}
          </Link>
          <p className="mt-1 text-xs text-muted">
            Node {guest.node}
            {guest.maxcpu ? ` · ${guest.maxcpu} CPU` : ""}
            {running ? ` · ${formatUptime(guest.uptime)}` : ""}
          </p>
          <div className="mt-2">
            <IpList ips={guest.ips} />
          </div>
        </div>
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

      <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {running ? (
          <>
            <ActionBtn
              icon={<Power className="size-3.5" />}
              label="Shut down"
              disabled={busy || backingUp}
              onClick={() => setConfirm("shutdown")}
            />
            <ActionBtn
              icon={<Square className="size-3.5" />}
              label="Stop"
              danger
              disabled={busy || backingUp}
              onClick={() => setConfirm("stop")}
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
        <ActionBtn
          icon={
            backingUp ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <HardDriveDownload className="size-3.5" />
            )
          }
          label={
            backingUp
              ? backup?.progress != null
                ? `${Math.round(backup.progress)}%`
                : "Backup…"
              : "Backup"
          }
          disabled={busy || backingUp || !guest.node || guest.vmid == null}
          onClick={() => setBackupOpen(true)}
        />
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
    </article>
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
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:px-2.5 sm:py-1.5 ${primary ? "border-transparent" : ""} ${tone}`}
    >
      {icon}
      {label}
    </button>
  );
}
