import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Play,
  Power,
  RotateCcw,
  Square,
  TerminalSquare,
} from "lucide-react";
import { dataApi } from "../api";
import { Header } from "../components/Header";
import { MetricBar } from "../components/MetricBar";
import { Sparkline } from "../components/Sparkline";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IpList } from "../components/IpList";
import { SnapshotPanel } from "../components/SnapshotPanel";
import { ResourceEditor } from "../components/ResourceEditor";
import { useApp } from "../context";
import { useGuestAction } from "../hooks";
import { POWER_CONFIRMS } from "../power";
import {
  cpuPct,
  formatBytes,
  formatUptime,
  guestLabel,
  usagePct,
} from "../format";
import type { GuestType } from "../types";

type PowerKind = keyof typeof POWER_CONFIRMS;

export default function GuestDetail() {
  const { type, node, vmid } = useParams();
  const { openConsole, toast } = useApp();
  const action = useGuestAction();
  const [confirm, setConfirm] = useState<PowerKind | null>(null);

  const q = useQuery({
    queryKey: ["guest", node, type, vmid],
    queryFn: () => dataApi.guest(node!, type!, vmid!),
    enabled: Boolean(node && type && vmid),
    refetchInterval: 3000,
  });

  if (!type || !node || !vmid) return null;

  const guestType = (type === "qemu" ? "qemu" : "lxc") as GuestType;
  const status = q.data?.status;
  const config = q.data?.config || {};
  const running = status?.status === "running";
  const name = String(status?.name || config.name || `Gast ${vmid}`);

  function run(kind: string) {
    action.mutate(
      { node: node!, type: guestType, vmid: Number(vmid), action: kind },
      { onSuccess: () => setConfirm(null) },
    );
  }

  function shell() {
    if (!running) {
      toast("err", "Die Shell ist nur bei laufenden Gästen verfügbar.");
      return;
    }
    openConsole({ type: guestType, node: node!, vmid: Number(vmid), name });
  }

  const cpuSeries = (q.data?.rrd || []).map((p) => (p.cpu || 0) * 100);
  const memSeries = (q.data?.rrd || []).map((p) =>
    p.maxmem ? ((p.mem || 0) / p.maxmem) * 100 : 0,
  );
  const netSeries = (q.data?.rrd || []).map((p) => (p.netin || 0) + (p.netout || 0));
  const meta = confirm ? POWER_CONFIRMS[confirm] : null;

  return (
    <div>
      <Header
        title={name}
        subtitle={`${guestLabel(guestType)} ${vmid} auf ${node}`}
      />
      <div className="space-y-6 px-8 py-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" />
          Zurück
        </Link>

        {q.isError ? (
          <p className="text-sm text-bad">{(q.error as Error).message}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={status?.status} />
          <span className="text-sm text-muted">{formatUptime(status?.uptime)}</span>
          <IpList ips={q.data?.ips} />
          <div className="ml-auto flex flex-wrap gap-2">
            {running ? (
              <>
                <Btn onClick={() => setConfirm("shutdown")} disabled={action.isPending}>
                  <Power className="size-3.5" /> Herunterfahren
                </Btn>
                <Btn danger onClick={() => setConfirm("stop")} disabled={action.isPending}>
                  <Square className="size-3.5" /> Stoppen
                </Btn>
                <Btn onClick={() => setConfirm("reboot")} disabled={action.isPending}>
                  <RotateCcw className="size-3.5" /> Neustart
                </Btn>
              </>
            ) : (
              <Btn primary onClick={() => run("start")} disabled={action.isPending}>
                <Play className="size-3.5" /> Starten
              </Btn>
            )}
            <Btn onClick={shell} disabled={!running}>
              <TerminalSquare className="size-3.5" /> Shell
            </Btn>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <MetricBar
              label="CPU"
              percent={cpuPct(status?.cpu)}
              detail={`${cpuPct(status?.cpu).toFixed(1)} % · ${status?.cpus ?? config.cores ?? "?"} Kerne`}
            />
            <div className="mt-4">
              <Sparkline values={cpuSeries} color="#ff7a1a" />
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <MetricBar
              label="RAM"
              percent={usagePct(status?.mem, status?.maxmem)}
              detail={`${formatBytes(status?.mem)} / ${formatBytes(status?.maxmem)}`}
            />
            <div className="mt-4">
              <Sparkline values={memSeries} color="#4cc9f0" />
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <MetricBar
              label="Festplatte"
              percent={usagePct(status?.disk, status?.maxdisk)}
              detail={`${formatBytes(status?.disk)} / ${formatBytes(status?.maxdisk)}`}
            />
            <div className="mt-4">
              <Sparkline values={netSeries} color="#34d399" />
            </div>
            <p className="mt-1 text-[11px] text-muted">Netzwerk-Verlauf (In+Out)</p>
          </div>
        </section>

        <ResourceEditor node={node} type={guestType} vmid={vmid} config={config} />
        <SnapshotPanel node={node} type={guestType} vmid={vmid} />

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-muted">Konfiguration</h2>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Hostname" value={str(config.hostname || config.name)} />
            <Item label="OS-Typ" value={str(config.ostype)} />
            <Item label="Kerne" value={str(config.cores || config.cpulimit)} />
            <Item label="Speicher" value={config.memory ? `${config.memory} MiB` : undefined} />
            <Item label="Swap" value={config.swap != null ? `${config.swap} MiB` : undefined} />
            <Item label="Root-FS" value={str(config.rootfs || config.scsi0 || config.virtio0)} />
            <Item label="Netzwerk" value={str(config.net0)} />
            <Item label="Autostart" value={config.onboot ? "ja" : "nein"} />
            <Item label="Unprivileged" value={config.unprivileged ? "ja" : undefined} />
          </dl>
        </section>
      </div>

      {meta && confirm ? (
        <ConfirmDialog
          title={meta.title}
          body={`${name}: ${meta.body}`}
          confirmLabel={meta.confirm}
          danger={meta.danger}
          busy={action.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      ) : null}
    </div>
  );
}

function str(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  return String(v);
}

function Item({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="truncate font-mono text-sm">{value || "—"}</dd>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  primary,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const tone = primary
    ? "border-transparent bg-accent text-black hover:bg-accent-2"
    : danger
      ? "border-bad/40 text-bad hover:bg-bad/10"
      : "border-line hover:bg-surface-2";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  );
}
