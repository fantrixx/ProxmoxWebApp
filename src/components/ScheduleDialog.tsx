import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { dataApi } from "../api";
import { formatSnapTime } from "../format";
import { ConfirmDialog } from "./ConfirmDialog";
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

function actionLabel(action: PowerSchedule["action"]): string {
  if (action === "shutdown") return "Shut down";
  if (action === "stop") return "Stop";
  return "Start";
}

function daysLabel(days: number[]): string {
  if (!days.length) return "Every day";
  return days.map((d) => DAY_LABELS[d]).join(", ");
}

function lastRunLabel(schedule: PowerSchedule): string {
  if (schedule.lastRunAt) return formatSnapTime(schedule.lastRunAt);
  if (schedule.lastRunKey) {
    const parsed = Date.parse(schedule.lastRunKey);
    if (Number.isFinite(parsed)) return formatSnapTime(Math.floor(parsed / 1000));
    return schedule.lastRunKey.replace("T", " ");
  }
  return "Never";
}

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
    return (list.data?.schedules || []).filter(
      (s) => s.node === node && s.type === type && s.vmid === vmidNum,
    );
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
  const busy = save.isPending || remove.isPending;

  function toggleDay(day: number) {
    setForm((f) => {
      const has = f.days.includes(day);
      const days = has ? f.days.filter((d) => d !== day) : [...f.days, day].sort();
      return { ...f, days };
    });
  }

  if (!open) return null;

  const title = name || `Guest ${vmid}`;

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
              <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  {guestSchedules.length} schedule
                  {guestSchedules.length === 1 ? "" : "s"}
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-black hover:bg-accent-2"
                >
                  Add schedule
                </button>
              </div>

              {list.isError ? (
                <p className="text-sm text-bad">{(list.error as Error).message}</p>
              ) : list.isLoading ? (
                <p className="text-sm text-muted">Loading schedules…</p>
              ) : guestSchedules.length === 0 ? (
                <p className="text-sm text-muted">No schedules for this guest yet.</p>
              ) : (
                <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                  {guestSchedules.map((s) => (
                    <li key={s.id} className="px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {actionLabel(s.action)} at {s.time}
                            {!s.enabled ? (
                              <span className="ml-2 text-xs font-normal text-muted">
                                (disabled)
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted">{daysLabel(s.days)}</p>
                          <p className="mt-1 text-[11px] text-muted">
                            Last run:{" "}
                            <span className="text-ink/80">{lastRunLabel(s)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openEdit(s)}
                          className="min-h-11 flex-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface-2 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDeleteId(s.id)}
                          className="min-h-11 flex-1 rounded-lg border border-bad/40 px-2.5 py-2 text-xs text-bad hover:bg-bad/10 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 shrink-0 text-[11px] text-muted">
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

                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, enabled: e.target.checked }))
                    }
                    className="accent-accent"
                  />
                  Enabled
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
