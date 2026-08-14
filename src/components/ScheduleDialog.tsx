import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { dataApi } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  ScheduleEmptyState,
  ScheduleRow,
  lastRunLabel,
  sortSchedules,
} from "./ScheduleList";
import { useApp } from "../context";
import { newId } from "../id";
import type { GuestType, PowerSchedule } from "../types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const emptyForm = (): Omit<PowerSchedule, "id"> & { id?: string } => ({
  node: "",
  type: "lxc",
  vmid: 0,
  enabled: true,
  action: "start",
  time: "08:00",
  days: [],
});

export function ScheduleDialog({
  open,
  onClose,
  node,
  type,
  vmid,
  name,
}: {
  open: boolean;
  onClose: () => void;
  node: string;
  type: GuestType;
  vmid: number | string;
  name?: string;
}) {
  const { toast } = useApp();
  const qc = useQueryClient();
  const vmidNum = Number(vmid);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<PowerSchedule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const list = useQuery({
    queryKey: ["schedules"],
    queryFn: () => dataApi.schedules(),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });

  const guestSchedules = useMemo(() => {
    const filtered = (list.data?.schedules || []).filter(
      (s) => s.node === node && s.type === type && s.vmid === vmidNum,
    );
    return sortSchedules(filtered);
  }, [list.data, node, type, vmidNum]);

  useEffect(() => {
    if (!open) {
      setMode("list");
      setEditing(null);
      setDeleteId(null);
      setForm(emptyForm());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteId) return;
      if (mode === "form") {
        setMode("list");
        setEditing(null);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode, deleteId, onClose]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm(),
      node,
      type,
      vmid: vmidNum,
      name,
    });
    setMode("form");
  }

  function openEdit(schedule: PowerSchedule) {
    setEditing(schedule);
    setForm({ ...schedule });
    setMode("form");
  }

  function backToList() {
    setMode("list");
    setEditing(null);
    setForm(emptyForm());
  }

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["schedules"] });
  }

  const save = useMutation({
    mutationFn: () => {
      const schedule: PowerSchedule = {
        id: editing?.id || newId(),
        node: form.node || node,
        type: (form.type as GuestType) || type,
        vmid: Number(form.vmid) || vmidNum,
        name: form.name || name,
        enabled: form.enabled,
        action: form.action,
        time: form.time,
        days: form.days,
        lastRunKey: editing?.lastRunKey,
        lastRunAt: editing?.lastRunAt,
      };
      return dataApi.saveSchedule(schedule);
    },
    onSuccess: () => {
      toast("ok", editing ? "Schedule updated." : "Schedule created.");
      backToList();
      invalidate();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const toggle = useMutation({
    mutationFn: (schedule: PowerSchedule) =>
      dataApi.saveSchedule({ ...schedule, enabled: !schedule.enabled }),
    onSuccess: (_data, schedule) => {
      toast("ok", schedule.enabled ? "Schedule paused." : "Schedule enabled.");
      invalidate();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => dataApi.deleteSchedule(id),
    onSuccess: () => {
      toast("ok", "Schedule deleted.");
      setDeleteId(null);
      invalidate();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const allDays = form.days.length === 0;
  const busy = save.isPending || remove.isPending || toggle.isPending;

  function toggleDay(day: number) {
    setForm((f) => {
      const has = f.days.includes(day);
      const days = has ? f.days.filter((d) => d !== day) : [...f.days, day].sort();
      return { ...f, days };
    });
  }

  if (!open) return null;

  const title = name || `Guest ${vmid}`;
  const activeCount = guestSchedules.filter((s) => s.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center sm:p-6">
      <div className="flex h-[min(90dvh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {mode === "form"
                  ? editing
                    ? "Edit schedule"
                    : "New schedule"
                  : "Power schedules"}
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted">
                {title} · {type === "lxc" ? "CT" : "VM"} {vmid}
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

        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          {mode === "list" ? (
            <>
              {guestSchedules.length > 0 ? (
                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                  <p className="text-xs text-muted">
                    {activeCount} active
                    {guestSchedules.length !== activeCount
                      ? ` · ${guestSchedules.length} total`
                      : guestSchedules.length === 1
                        ? " schedule"
                        : " schedules"}
                  </p>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-black hover:bg-accent-2"
                  >
                    <Plus className="size-3.5" />
                    Add
                  </button>
                </div>
              ) : null}

              {list.isError ? (
                <p className="text-sm text-bad">{(list.error as Error).message}</p>
              ) : list.isLoading ? (
                <p className="text-sm text-muted">Loading schedules…</p>
              ) : guestSchedules.length === 0 ? (
                <ScheduleEmptyState onAdd={openCreate} />
              ) : (
                <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
                  {guestSchedules.map((s) => (
                    <ScheduleRow
                      key={s.id}
                      schedule={s}
                      busy={busy}
                      onEdit={() => openEdit(s)}
                      onDelete={() => setDeleteId(s.id)}
                      onToggle={() => toggle.mutate(s)}
                    />
                  ))}
                </ul>
              )}

              <p className="mt-3 shrink-0 text-[11px] leading-relaxed text-muted">
                ProxPanel must keep running. Use an API token in <code>.env</code> so
                schedules survive reboot.
              </p>
            </>
          ) : (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs text-muted">Action</span>
                    <select
                      value={form.action}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          action: e.target.value as PowerSchedule["action"],
                        }))
                      }
                      className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
                    >
                      <option value="start">Start</option>
                      <option value="shutdown">Shut down</option>
                      <option value="stop">Stop</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs text-muted">Time</span>
                    <input
                      type="time"
                      value={form.time}
                      onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                      className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
                      required
                    />
                  </label>
                </div>

                <div>
                  <span className="mb-2 block text-xs text-muted">Days</span>
                  <div className="flex flex-wrap gap-2">
                    <DayChip
                      active={allDays}
                      onClick={() => setForm((f) => ({ ...f, days: [] }))}
                    >
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

                <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg/40 px-3 py-3 text-sm">
                  <span>
                    <span className="block font-medium">Enabled</span>
                    <span className="text-xs text-muted">
                      Pause without deleting this schedule
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, enabled: e.target.checked }))
                    }
                    className="size-4 accent-accent"
                  />
                </label>

                {editing ? (
                  <p className="text-xs text-muted">
                    Last run: {lastRunLabel(editing)}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex shrink-0 flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={backToList}
                  className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-40 sm:min-h-0"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0"
                >
                  {save.isPending ? "Saving…" : editing ? "Save changes" : "Create"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {deleteId ? (
        <ConfirmDialog
          title="Delete schedule?"
          body="This power schedule will be permanently removed."
          confirmLabel="Delete"
          danger
          busy={remove.isPending}
          onCancel={() => setDeleteId(null)}
          onConfirm={() => remove.mutate(deleteId)}
        />
      ) : null}
    </div>
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
      className={`rounded-lg border px-2.5 py-1 text-xs ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
