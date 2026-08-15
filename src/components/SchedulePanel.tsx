import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { dataApi } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { ScheduleEmptyState, ScheduleRow, sortSchedules } from "./ScheduleList";
import {
  ScheduleFormFields,
  buildSchedulePayload,
  emptyScheduleForm,
  type ScheduleFormState,
} from "./ScheduleFormFields";
import { useApp } from "../context";
import { newId } from "../id";
import type { GuestType, PowerSchedule } from "../types";

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
  const [form, setForm] = useState<ScheduleFormState>(emptyScheduleForm());

  const list = useQuery({
    queryKey: ["schedules"],
    queryFn: () => dataApi.schedules(),
  });

  const guestSchedules = useMemo(() => {
    const id = Number(vmid);
    const filtered = (list.data?.schedules || []).filter(
      (s) => s.node === node && s.type === type && s.vmid === id,
    );
    return sortSchedules(filtered);
  }, [list.data, node, type, vmid]);

  useEffect(() => {
    if (creating && !editing) {
      setForm({
        ...emptyScheduleForm(),
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
    setForm({
      ...emptyScheduleForm(),
      ...schedule,
      storage: schedule.storage || "",
      backupMode: schedule.backupMode || "snapshot",
      compress: schedule.compress || "zstd",
    });
  }

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm({
      ...emptyScheduleForm(),
      node,
      type,
      vmid: Number(vmid),
      name,
    });
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
    setForm(emptyScheduleForm());
  }

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["schedules"] });
  }

  const save = useMutation({
    mutationFn: () => {
      const schedule = buildSchedulePayload(form, editing, {
        node,
        type,
        vmid: Number(vmid),
        name,
      });
      schedule.id = editing?.id || newId();
      if (schedule.action === "backup" && !schedule.storage) {
        return Promise.reject(new Error("Select a backup storage first."));
      }
      return dataApi.saveSchedule(schedule);
    },
    onSuccess: () => {
      toast("ok", "Schedule saved.");
      closeForm();
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

  const busy = save.isPending || remove.isPending || toggle.isPending;
  const showForm = creating || Boolean(editing);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted">Schedules</h2>
        {!showForm && guestSchedules.length > 0 ? (
          <button
            type="button"
            onClick={openCreate}
            className="min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-surface-2 sm:min-h-0"
          >
            Add schedule
          </button>
        ) : null}
      </div>

      <p className="mb-4 text-xs text-muted">
        Requires ProxPanel to keep running. Prefer an API token in <code>.env</code> for
        schedules after reboot. Backup schedules need VM.Backup and storage space
        permissions.
      </p>

      {list.isError ? (
        <p className="text-sm text-bad">{(list.error as Error).message}</p>
      ) : guestSchedules.length === 0 && !showForm ? (
        <div className="mb-2">
          <ScheduleEmptyState onAdd={openCreate} />
        </div>
      ) : guestSchedules.length > 0 ? (
        <ul className="mb-4 flex max-h-80 flex-col gap-2 overflow-y-auto pr-0.5">
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
      ) : null}

      {showForm ? (
        <form
          className="space-y-4 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <ScheduleFormFields
            form={form}
            setForm={setForm}
            node={node}
            size="panel"
          />

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
          body="This schedule will be permanently removed."
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
