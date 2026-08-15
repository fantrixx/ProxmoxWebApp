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
import {
  ScheduleFormFields,
  buildSchedulePayload,
  emptyScheduleForm,
  type ScheduleFormState,
} from "./ScheduleFormFields";
import { useApp } from "../context";
import { newId } from "../id";
import type { GuestType, PowerSchedule } from "../types";

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
  const [form, setForm] = useState<ScheduleFormState>(emptyScheduleForm());

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
      setForm(emptyScheduleForm());
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
      ...emptyScheduleForm(),
      node,
      type,
      vmid: vmidNum,
      name,
    });
    setMode("form");
  }

  function openEdit(schedule: PowerSchedule) {
    setEditing(schedule);
    setForm({
      ...emptyScheduleForm(),
      ...schedule,
      storage: schedule.storage || "",
      backupMode: schedule.backupMode || "snapshot",
      compress: schedule.compress || "zstd",
    });
    setMode("form");
  }

  function backToList() {
    setMode("list");
    setEditing(null);
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
        vmid: vmidNum,
        name,
      });
      schedule.id = editing?.id || newId();
      if (schedule.action === "backup" && !schedule.storage) {
        return Promise.reject(new Error("Select a backup storage first."));
      }
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

  const busy = save.isPending || remove.isPending || toggle.isPending;

  if (!open) return null;

  const title = name || `Guest ${vmid}`;
  const activeCount = guestSchedules.filter((s) => s.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <div className="flex h-[min(90dvh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {mode === "form"
                  ? editing
                    ? "Edit schedule"
                    : "New schedule"
                  : "Schedules"}
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
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-black hover:bg-accent-2 sm:min-h-0"
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
                schedules survive reboot. Backup schedules need VM.Backup and storage
                space permissions.
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
                <ScheduleFormFields
                  form={form}
                  setForm={setForm}
                  node={node}
                  size="dialog"
                />

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
          body="This schedule will be permanently removed."
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
