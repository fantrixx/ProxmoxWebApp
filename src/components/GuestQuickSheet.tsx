import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  Disc3,
  HardDriveDownload,
  Loader2,
  Play,
  Power,
  RotateCcw,
  Square,
  TerminalSquare,
  X,
} from "lucide-react";
import type { ClusterResource, GuestType } from "../types";
import {
  formatUptime,
  guestLabel,
  guestVisualStatus,
} from "../format";
import { StatusBadge } from "./StatusBadge";
import { ServiceIcon } from "./ServiceIcon";
import { IpList } from "./IpList";
import { ConfirmDialog } from "./ConfirmDialog";
import { BackupDialog } from "./BackupDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { CdromPanel } from "./CdromPanel";
import { useApp } from "../context";
import { useGuestAction } from "../hooks";
import { useGuestBackupProgress } from "../hooks/useGuestBackupProgress";
import { POWER_CONFIRMS } from "../power";
import { reconcilePendingGuestAction } from "../pendingGuest";
import { resolveQuickBackup } from "../quickBackup";
import { dataApi } from "../api";
import { useQuery } from "@tanstack/react-query";

type PowerKind = keyof typeof POWER_CONFIRMS;

export function GuestQuickSheet({
  guest,
  open,
  onClose,
}: {
  guest: ClusterResource | null;
  open: boolean;
  onClose: () => void;
}) {
  const { openConsole, toast, startGuestBackup } = useApp();
  const action = useGuestAction();
  const [confirm, setConfirm] = useState<PowerKind | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [showCdrom, setShowCdrom] = useState(false);

  const type = (guest?.type === "qemu" ? "qemu" : "lxc") as GuestType;
  const node = guest?.node || "";
  const vmid = guest?.vmid;
  const pending = reconcilePendingGuestAction(
    guest?.node,
    type,
    guest?.vmid,
    guest?.status,
    guest?.qmpstatus,
  );
  const visual = guestVisualStatus({
    status: guest?.status,
    qmpstatus: guest?.qmpstatus,
    lock: guest?.lock,
    pending,
  });
  const running = visual === "running";
  const busy = action.isPending;
  const backup = useGuestBackupProgress(guest?.node, guest?.vmid);

  const detail = useQuery({
    queryKey: ["guest", node, type, String(vmid)],
    queryFn: () => dataApi.guest(node, type, String(vmid!)),
    enabled: open && Boolean(node) && vmid != null && showCdrom && type === "qemu",
  });

  useEffect(() => {
    if (!open) {
      setConfirm(null);
      setBackupOpen(false);
      setScheduleOpen(false);
      setShowCdrom(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !guest || !node || vmid == null) return null;

  const vmidNum = Number(vmid);
  const name = guest.name || String(vmid);
  const meta = confirm ? POWER_CONFIRMS[confirm] : null;

  function run(kind: string) {
    action.mutate(
      { node, type, vmid: vmidNum, action: kind },
      { onSuccess: () => setConfirm(null) },
    );
  }

  function shell() {
    if (!running) {
      toast("err", "Shell is only available for running guests.");
      return;
    }
    openConsole({ type, node, vmid: vmidNum, name });
  }

  async function quickBackup() {
    setBackupBusy(true);
    try {
      const resolved = await resolveQuickBackup(node, type, String(vmidNum));
      if (!resolved) {
        setBackupOpen(true);
        return;
      }
      await startGuestBackup({ ...resolved, name });
    } catch {
      /* toasted in context */
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-6">
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="relative z-10 flex max-h-[min(88dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <ServiceIcon
                name={name}
                tags={guest.tags}
                node={node}
                type={type}
                vmid={vmid}
                className="size-11"
              />
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{name}</h2>
                <p className="truncate text-xs text-muted">
                  {guestLabel(type)} {vmid} · {node}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={guest.status}
                qmpstatus={guest.qmpstatus}
                lock={guest.lock}
                pending={pending}
              />
              <span className="text-xs text-muted">{formatUptime(guest.uptime)}</span>
              <IpList ips={guest.ips} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {running ? (
                <>
                  <SheetBtn
                    icon={<Power className="size-3.5" />}
                    label="Shut down"
                    disabled={busy}
                    onClick={() => setConfirm("shutdown")}
                  />
                  <SheetBtn
                    icon={<RotateCcw className="size-3.5" />}
                    label="Restart"
                    disabled={busy}
                    onClick={() => setConfirm("reboot")}
                  />
                  <SheetBtn
                    icon={<Square className="size-3.5" />}
                    label="Force stop"
                    danger
                    disabled={busy}
                    onClick={() => setConfirm("stop")}
                  />
                </>
              ) : (
                <SheetBtn
                  icon={<Play className="size-3.5" />}
                  label="Start"
                  primary
                  disabled={busy}
                  onClick={() => run("start")}
                />
              )}
              <SheetBtn
                icon={<TerminalSquare className="size-3.5" />}
                label="Shell"
                disabled={busy || !running}
                onClick={shell}
              />
              <SheetBtn
                icon={
                  backupBusy || backup?.running ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <HardDriveDownload className="size-3.5" />
                  )
                }
                label="Backup"
                disabled={busy || backupBusy || Boolean(backup?.running)}
                onClick={() => void quickBackup()}
              />
              <SheetBtn
                icon={<CalendarClock className="size-3.5" />}
                label="Schedule"
                disabled={busy}
                onClick={() => setScheduleOpen(true)}
              />
              {type === "qemu" ? (
                <SheetBtn
                  icon={<Disc3 className="size-3.5" />}
                  label="ISO"
                  disabled={busy}
                  onClick={() => setShowCdrom((v) => !v)}
                />
              ) : null}
            </div>

            {showCdrom && type === "qemu" ? (
              <div className="rounded-xl border border-line bg-bg/40 p-3">
                {detail.isLoading ? (
                  <p className="text-xs text-muted">Loading CD/DVD…</p>
                ) : detail.data?.config ? (
                  <CdromPanel
                    node={node}
                    vmid={String(vmid)}
                    config={detail.data.config}
                  />
                ) : (
                  <p className="text-xs text-muted">Could not load guest config.</p>
                )}
              </div>
            ) : null}

            <Link
              to={`/guest/${type}/${encodeURIComponent(node)}/${vmid}`}
              onClick={onClose}
              className="block rounded-xl border border-line px-3 py-2.5 text-center text-sm hover:bg-surface-2"
            >
              Open full details
            </Link>
          </div>
        </div>
      </div>

      {meta && confirm ? (
        <ConfirmDialog
          title={meta.title}
          body={`${name}: ${meta.body}`}
          confirmLabel={meta.confirm}
          danger={meta.danger}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      ) : null}

      <BackupDialog
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        node={node}
        type={type}
        vmid={vmid}
        name={name}
      />
      <ScheduleDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        node={node}
        type={type}
        vmid={vmid}
        name={name}
      />
    </>
  );
}

function SheetBtn({
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
    ? "border-accent/40 bg-accent/15 text-accent"
    : danger
      ? "border-bad/40 bg-bad/10 text-bad"
      : "border-line text-ink hover:bg-surface-2";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-40 ${tone}`}
    >
      {icon}
      {label}
    </button>
  );
}
