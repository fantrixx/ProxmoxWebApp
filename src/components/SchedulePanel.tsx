import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { dataApi } from "../api";
import { formatSnapTime } from "../format";
import { ConfirmDialog } from "./ConfirmDialog";
import { useApp } from "../context";
import { newId } from "../id";
import type { GuestType, PowerSchedule } from "../types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function lastRunLabel(schedule: PowerSchedule): string {
  if (schedule.lastRunAt) return formatSnapTime(schedule.lastRunAt);
  if (schedule.lastRunKey) {
    const parsed = Date.parse(schedule.lastRunKey);
    if (Number.isFinite(parsed)) return formatSnapTime(Math.floor(parsed / 1000));
    return schedule.lastRunKey.replace("T", " ");
  }
  return "Never";
}

const emptyForm = (): Omit<PowerSchedule, "id"> & { id?: string } => ({
  node: "",
  type: "lxc",
  vmid: 0,
  enabled: true,
  action: "start",
  time: "08:00",
  days: [],
});

export function SchedulePanel({
  node,
  type,
  vmid,
  name,
}: {
  node: string;
  type: GuestType;
  vmid: string;
  name?: string;
}) {
  const { toast } = useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PowerSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const list = useQuery({
    queryKey: ["schedules"],
    queryFn: () => dataApi.schedules(),
  });

  const guestSchedules = useMemo(() => {
    const id = Number(vmid);
    return (list.data?.schedules || []).filter(
      (s) => s.node === node && s.type === type && s.vmid === id,
    );
  }, [list.data, node, type, vmid]);

  useEffect(() => {
    if (creating && !editing) {
      setForm({
        ...emptyForm(),
        node,
        type,
        vmid: Number(vmid),
        name,
      });
    }
  }, [creating, editing, node, type, vmid, name]);

  function openEdit(schedule: PowerSchedule) {
    setEditing(schedule);
    setCreating(false);
    setForm({ ...schedule });
  }

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm({
      ...emptyForm(),
      node,
      type,
      vmid: Number(vmid),
      name,
    });
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
    setForm(emptyForm());
  }

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["schedules"] });
  }

  const save = useMutation({
    mutationFn: () => {
      const schedule: PowerSchedule = {
        id: editing?.id || newId(),
        node: form.node,
        type: form.type as GuestType,
        vmid: Number(form.vmid),
        name: form.name,
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
      toast("ok", "Schedule saved.");
      closeForm();
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
  const showForm = creating || editing;

  function toggleDay(day: number) {
    setForm((f) => {
      const has = f.days.includes(day);
      const days = has ? f.days.filter((d) => d !== day) : [...f.days, day].sort();
      return { ...f, days };
    });
  }

  function setAllDays() {
    setForm((f) => ({ ...f, days: [] }));
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted">Power schedules</h2>
        {!showForm ? (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-surface-2"
          >
            Add schedule
          </button>
        ) : null}
      </div>

      <p className="mb-4 text-xs text-muted">
        Requires ProxPanel to keep running. Prefer an API token in <code>.env</code> for
        schedules after reboot.
      </p>

      {list.isError ? (
        <p className="text-sm text-bad">{(list.error as Error).message}</p>
      ) : guestSchedules.length === 0 && !showForm ? (
        <p className="text-sm text-muted">No schedules for this guest.</p>
      ) : (
        <ul className="mb-4 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {guestSchedules.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {s.action} at {s.time}
                  {!s.enabled ? (
                    <span className="ml-2 text-xs text-muted">(disabled)</span>
                  ) : null}
                </div>
                <div className="text-xs text-muted">
                  {s.days.length === 0
                    ? "Every day"
                    : s.days.map((d) => DAY_LABELS[d]).join(", ")}
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  Last run: <span className="text-ink/80">{lastRunLabel(s)}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => openEdit(s)}
                className="min-h-11 flex-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface-2 disabled:opacity-40 sm:min-h-0 sm:flex-none sm:py-1.5"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteId(s.id)}
                className="min-h-11 flex-1 rounded-lg border border-bad/40 px-2.5 py-2 text-xs text-bad hover:bg-bad/10 disabled:opacity-40 sm:min-h-0 sm:flex-none sm:py-1.5"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form
          className="space-y-4 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-[11px] text-muted">Action</span>
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
              <span className="mb-1 block text-[11px] text-muted">Time</span>
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
            <span className="mb-2 block text-[11px] text-muted">Days</span>
            <div className="flex flex-wrap gap-2">
              <DayChip active={allDays} onClick={setAllDays}>
                All
              </DayChip>
              {DAY_LABELS.map((label, i) => (
                <DayChip
                  key={label}
                  active={!allDays && form.days.includes(i)}
                  onClick={() => {
                    if (allDays) {
                      setForm((f) => ({ ...f, days: [i] }));
                    } else {
                      toggleDay(i);
                    }
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
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="accent-accent"
            />
            Enabled
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={closeForm}
              className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : null}

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
    </section>
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
