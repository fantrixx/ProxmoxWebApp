import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
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
import { IpList } from "./IpList";
import { useApp } from "../context";
import { useGuestAction } from "../hooks";
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
  const running = guest.status === "running";
  const type = (guest.type === "qemu" ? "qemu" : "lxc") as GuestType;
  const busy = action.isPending;

  function run(kind: string) {
    if (!guest.node || guest.vmid == null) return;
    action.mutate(
      { node: guest.node, type, vmid: guest.vmid, action: kind },
      { onSuccess: () => setConfirm(null) },
    );
  }

  function shell() {
    if (!running) {
      toast("err", "Die Shell ist nur bei laufenden Gästen verfügbar.");
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

  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <StatusBadge status={guest.status} />
            <span className="rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {guestLabel(type)} {guest.vmid}
            </span>
          </div>
          <Link
            to={`/guest/${type}/${guest.node}/${guest.vmid}`}
            className="text-lg font-semibold tracking-tight hover:text-accent"
          >
            {guest.name || `Gast ${guest.vmid}`}
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
          label="Festplatte"
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

      <div className="mt-5 flex flex-wrap gap-2">
        {running ? (
          <>
            <ActionBtn
              icon={<Power className="size-3.5" />}
              label="Herunterfahren"
              disabled={busy}
              onClick={() => setConfirm("shutdown")}
            />
            <ActionBtn
              icon={<Square className="size-3.5" />}
              label="Stoppen"
              danger
              disabled={busy}
              onClick={() => setConfirm("stop")}
            />
            <ActionBtn
              icon={<RotateCcw className="size-3.5" />}
              label="Neustart"
              disabled={busy}
              onClick={() => setConfirm("reboot")}
            />
          </>
        ) : (
          <ActionBtn
            icon={<Play className="size-3.5" />}
            label="Starten"
            primary
            disabled={busy}
            onClick={() => run("start")}
          />
        )}
        <ActionBtn
          icon={<TerminalSquare className="size-3.5" />}
          label="Shell"
          disabled={busy || !running}
          onClick={shell}
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
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "border-transparent" : ""} ${tone}`}
    >
      {icon}
      {label}
    </button>
  );
}
