import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { GuestTypeIcon } from "../components/GuestTypeIcon";
import { ServiceIcon } from "../components/ServiceIcon";
import {
  GuestIconPicker,
  iconDraftFromRecord,
  persistIconDraft,
  type IconDraft,
} from "../components/GuestIconPicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IpList } from "../components/IpList";
import { SnapshotPanel } from "../components/SnapshotPanel";
import { ResourceEditor } from "../components/ResourceEditor";
import { BackupPanel } from "../components/BackupPanel";
import { SchedulePanel } from "../components/SchedulePanel";
import { CdromPanel } from "../components/CdromPanel";
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
import { reconcilePendingGuestAction } from "../pendingGuest";
import { guestIconKey } from "../guestIconKey";
import type { GuestType } from "../types";

type PowerKind = keyof typeof POWER_CONFIRMS;

export default function GuestDetail() {
  const { type, node, vmid } = useParams();
  const navigate = useNavigate();
  const { openConsole, toast } = useApp();
  const qc = useQueryClient();
  const action = useGuestAction();
  const [confirm, setConfirm] = useState<PowerKind | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconDraft, setIconDraft] = useState<IconDraft>({ mode: "auto" });

  const q = useQuery({
    queryKey: ["guest", node, type, vmid],
    queryFn: () => dataApi.guest(node!, type!, vmid!),
    enabled: Boolean(node && type && vmid),
    refetchInterval: 3000,
  });

  const iconsQ = useQuery({
    queryKey: ["guestIcons"],
    queryFn: () => dataApi.guestIcons(),
    enabled: Boolean(node && type && vmid),
  });

  const guestType = (type === "qemu" ? "qemu" : "lxc") as GuestType;
  const iconKey =
    node && type && vmid ? guestIconKey(node, guestType, vmid) : null;
  const storedIcon = iconKey ? iconsQ.data?.icons?.[iconKey] || null : null;

  const saveIcon = useMutation({
    mutationFn: async (draft: IconDraft) => {
      if (!node || !vmid) throw new Error("Missing guest.");
      const body = await persistIconDraft(
        draft,
        String(q.data?.status?.name || q.data?.config?.name || ""),
        (file) => dataApi.uploadGuestIcon(file),
      );
      if (!body || body === "clear") {
        await dataApi.deleteGuestIcon(node, guestType, vmid);
        return;
      }
      await dataApi.setGuestIcon(node, guestType, vmid, body);
    },
    onSuccess: () => {
      toast("ok", "Logo updated.");
      void qc.invalidateQueries({ queryKey: ["guestIcons"] });
      setIconPickerOpen(false);
    },
    onError: (err: Error) => toast("err", err.message),
  });

  if (!type || !node || !vmid) return null;

  const status = q.data?.status;
  const config = q.data?.config || {};
  const pending = reconcilePendingGuestAction(
    node,
    guestType,
    vmid,
    status?.status,
    status?.qmpstatus,
  );
  const running = status?.status === "running" && pending !== "shutting down" && pending !== "stopping";
  const name = String(status?.name || config.name || `Guest ${vmid}`);
  const tags = typeof config.tags === "string" ? config.tags : undefined;

  function run(kind: string) {
    action.mutate(
      { node: node!, type: guestType, vmid: Number(vmid), action: kind },
      { onSuccess: () => setConfirm(null) },
    );
  }

  function shell() {
    if (!running) {
      toast("err", "Shell is only available for running containers.");
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
    <div className="max-w-full overflow-x-hidden">
      <Header
        title={name}
        subtitle={`${guestLabel(guestType)} ${vmid} on ${node}`}
      />
      <div className="max-w-full space-y-4 overflow-x-hidden px-4 py-3 md:space-y-6 md:px-8 md:py-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink md:text-sm"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        {q.isError ? (
          <p className="text-sm text-bad">{(q.error as Error).message}</p>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge
                status={status?.status}
                qmpstatus={status?.qmpstatus}
                lock={status?.lock}
                pending={pending}
              />
              <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                <GuestTypeIcon type={guestType} className="size-3.5" />
                {guestLabel(guestType)} {vmid}
              </span>
              <span className="text-sm text-muted">{formatUptime(status?.uptime)}</span>
              <IpList
                ips={q.data?.ips}
                name={name}
                tags={tags}
                guestType={guestType}
                node={node}
                type={guestType}
                vmid={vmid}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {running ? (
                <>
                  <Btn onClick={() => setConfirm("shutdown")} disabled={action.isPending}>
                    <Power className="size-3.5" /> Shut down
                  </Btn>
                  <Btn danger onClick={() => setConfirm("stop")} disabled={action.isPending}>
                    <Square className="size-3.5" /> Stop
                  </Btn>
                  <Btn onClick={() => setConfirm("reboot")} disabled={action.isPending}>
                    <RotateCcw className="size-3.5" /> Restart
                  </Btn>
                </>
              ) : (
                <Btn primary onClick={() => run("start")} disabled={action.isPending}>
                  <Play className="size-3.5" /> Start
                </Btn>
              )}
              <Btn onClick={shell} disabled={!running}>
                <TerminalSquare className="size-3.5" /> Shell
              </Btn>
            </div>
          </div>
          <ServiceIcon
            name={name}
            tags={tags}
            node={node}
            type={guestType}
            vmid={vmid}
            record={storedIcon}
            className="size-14"
            editable
            onEdit={() => {
              setIconDraft(iconDraftFromRecord(storedIcon));
              setIconPickerOpen(true);
            }}
          />
        </div>

        <section className="grid min-w-0 gap-4 md:grid-cols-3">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-5">
            <MetricBar
              label="CPU"
              percent={cpuPct(status?.cpu)}
              detail={`${cpuPct(status?.cpu).toFixed(1)} % · ${status?.cpus ?? config.cores ?? "?"} cores`}
            />
            <div className="mt-4 min-w-0">
              <Sparkline values={cpuSeries} color="#ff7a1a" />
            </div>
          </div>
          <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-5">
            <MetricBar
              label="RAM"
              percent={usagePct(status?.mem, status?.maxmem)}
              detail={`${formatBytes(status?.mem)} / ${formatBytes(status?.maxmem)}`}
            />
            <div className="mt-4 min-w-0">
              <Sparkline values={memSeries} color="#4cc9f0" />
            </div>
          </div>
          <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-5">
            <MetricBar
              label="Disk"
              percent={usagePct(status?.disk, status?.maxdisk)}
              detail={`${formatBytes(status?.disk)} / ${formatBytes(status?.maxdisk)}`}
            />
            <div className="mt-4 min-w-0">
              <Sparkline values={netSeries} color="#34d399" />
            </div>
            <p className="mt-1 text-[11px] text-muted">Network history (in+out)</p>
          </div>
        </section>

        <ResourceEditor node={node} type={guestType} vmid={vmid} config={config} />
        <SnapshotPanel node={node} type={guestType} vmid={vmid} />
        {guestType === "qemu" ? (
          <CdromPanel node={node} vmid={vmid} config={config} />
        ) : null}
        <BackupPanel node={node} type={guestType} vmid={vmid} name={name} />
        <SchedulePanel node={node} type={guestType} vmid={vmid} name={name} />

        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-muted">Configuration</h2>
          <dl className="grid min-w-0 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Hostname" value={str(config.hostname || config.name)} />
            <Item label="OS type" value={str(config.ostype)} />
            <Item label="Cores" value={str(config.cores || config.cpulimit)} />
            <Item label="Memory" value={config.memory ? `${config.memory} MiB` : undefined} />
            <Item label="Swap" value={config.swap != null ? `${config.swap} MiB` : undefined} />
            <Item label="Root FS" value={str(config.rootfs || config.scsi0 || config.virtio0)} />
            <Item label="Network" value={str(config.net0)} />
            <Item label="Autostart" value={config.onboot ? "yes" : "no"} />
            <Item label="Unprivileged" value={config.unprivileged ? "yes" : undefined} />
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

      <GuestIconPicker
        open={iconPickerOpen}
        name={name}
        tags={tags}
        value={iconDraft}
        onChange={setIconDraft}
        onClose={() => setIconPickerOpen(false)}
        title="Guest logo"
        doneLabel="Save logo"
        onPersist={async (draft) => {
          await saveIcon.mutateAsync(draft);
        }}
      />
    </div>
  );
}

function str(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  return String(v);
}

function Item({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="break-all font-mono text-sm [overflow-wrap:anywhere]">
        {value || "—"}
      </dd>
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
      className={`inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto ${tone}`}
    >
      {children}
    </button>
  );
}
