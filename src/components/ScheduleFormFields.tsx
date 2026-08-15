import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataApi } from "../api";
import type { BackupCompress, BackupMode, PowerSchedule, ScheduleAction } from "../types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type ScheduleFormState = Omit<PowerSchedule, "id"> & { id?: string };

export function emptyScheduleForm(): ScheduleFormState {
  return {
    node: "",
    type: "lxc",
    vmid: 0,
    enabled: true,
    action: "start",
    time: "08:00",
    days: [],
    storage: "",
    backupMode: "snapshot",
    compress: "zstd",
  };
}

export function buildSchedulePayload(
  form: ScheduleFormState,
  editing: PowerSchedule | null,
  fallback?: { node: string; type: PowerSchedule["type"]; vmid: number; name?: string },
): PowerSchedule {
  const action = form.action;
  const schedule: PowerSchedule = {
    id: editing?.id || "",
    node: form.node || fallback?.node || "",
    type: (form.type as PowerSchedule["type"]) || fallback?.type || "lxc",
    vmid: Number(form.vmid) || fallback?.vmid || 0,
    name: form.name || fallback?.name,
    enabled: form.enabled,
    action,
    time: form.time,
    days: form.days,
    lastRunKey: editing?.lastRunKey,
    lastRunAt: editing?.lastRunAt,
  };
  if (action === "backup") {
    schedule.storage = form.storage;
    schedule.backupMode = form.backupMode || "snapshot";
    schedule.compress = form.compress || "zstd";
  }
  return schedule;
}

export function ScheduleFormFields({
  form,
  setForm,
  node,
  size = "dialog",
}: {
  form: ScheduleFormState;
  setForm: (updater: (f: ScheduleFormState) => ScheduleFormState) => void;
  node: string;
  size?: "dialog" | "panel";
}) {
  const labelCls = size === "dialog" ? "mb-1.5 block text-xs text-muted" : "mb-1 block text-[11px] text-muted";
  const inputCls =
    "w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-accent md:text-sm";

  const storages = useQuery({
    queryKey: ["backupStorages"],
    queryFn: () => dataApi.backupStorages(),
    enabled: form.action === "backup",
  });

  const nodeStorages = useMemo(() => {
    const all = storages.data?.storages || [];
    return all.filter((s) => s.node === node || s.shared);
  }, [storages.data, node]);

  useEffect(() => {
    if (form.action !== "backup") return;
    if (form.storage) return;
    if (nodeStorages[0]?.storage) {
      setForm((f) => ({ ...f, storage: nodeStorages[0]!.storage }));
    }
  }, [form.action, form.storage, nodeStorages, setForm]);

  const allDays = form.days.length === 0;

  function toggleDay(day: number) {
    setForm((f) => {
      const has = f.days.includes(day);
      const days = has ? f.days.filter((d) => d !== day) : [...f.days, day].sort();
      return { ...f, days };
    });
  }

  function setAction(action: ScheduleAction) {
    setForm((f) => ({
      ...f,
      action,
      ...(action === "backup"
        ? {
            backupMode: (f.backupMode || "snapshot") as BackupMode,
            compress: (f.compress || "zstd") as BackupCompress,
          }
        : {}),
    }));
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={labelCls}>Action</span>
          <select
            value={form.action}
            onChange={(e) => setAction(e.target.value as ScheduleAction)}
            className={inputCls}
          >
            <option value="start">Start</option>
            <option value="shutdown">Shut down</option>
            <option value="stop">Stop</option>
            <option value="backup">Backup</option>
          </select>
        </label>
        <label>
          <span className={labelCls}>Time</span>
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
            className={inputCls}
            required
          />
        </label>
      </div>

      {form.action === "backup" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={labelCls}>Storage</span>
            <select
              value={form.storage || ""}
              onChange={(e) => setForm((f) => ({ ...f, storage: e.target.value }))}
              className={inputCls}
              disabled={storages.isLoading || nodeStorages.length === 0}
              required
            >
              {nodeStorages.length === 0 ? (
                <option value="">No backup storage found</option>
              ) : (
                nodeStorages.map((s) => (
                  <option key={`${s.node}:${s.storage}`} value={s.storage}>
                    {s.storage}
                    {s.shared ? " (shared)" : ""}
                    {s.node !== node ? ` · ${s.node}` : ""}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            <span className={labelCls}>Mode</span>
            <select
              value={form.backupMode || "snapshot"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  backupMode: e.target.value as BackupMode,
                }))
              }
              className={inputCls}
            >
              <option value="snapshot">Snapshot (recommended)</option>
              <option value="suspend">Suspend</option>
              <option value="stop">Stop</option>
            </select>
          </label>
          <label>
            <span className={labelCls}>Compression</span>
            <select
              value={form.compress || "zstd"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  compress: e.target.value as BackupCompress,
                }))
              }
              className={inputCls}
            >
              <option value="zstd">ZSTD</option>
              <option value="gzip">GZIP</option>
              <option value="lzo">LZO</option>
              <option value="0">None</option>
            </select>
          </label>
        </div>
      ) : null}

      <div>
        <span className={labelCls}>Days</span>
        <div className="flex flex-wrap gap-2">
          <DayChip active={allDays} onClick={() => setForm((f) => ({ ...f, days: [] }))}>
            All
          </DayChip>
          {DAY_LABELS.map((label, i) => (
            <DayChip
              key={label}
              active={!allDays && form.days.includes(i)}
              onClick={() => {
                if (allDays) setForm((f) => ({ ...f, days: [i] }));
                else toggleDay(i);
              }}
            >
              {label}
            </DayChip>
          ))}
        </div>
      </div>
    </>
  );
}

function DayChip({
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
      className={`min-h-11 rounded-lg border px-3 py-1 text-xs sm:min-h-0 sm:px-2.5 ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
