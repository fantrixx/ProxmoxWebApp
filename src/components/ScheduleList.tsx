import type { ReactNode } from "react";
import {
  CalendarClock,
  Pencil,
  Play,
  Power,
  Square,
  Trash2,
} from "lucide-react";
import type { PowerSchedule } from "../types";
import { formatSnapTime } from "../format";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function actionLabel(action: PowerSchedule["action"]): string {
  if (action === "shutdown") return "Shut down";
  if (action === "stop") return "Stop";
  return "Start";
}

export function lastRunLabel(schedule: PowerSchedule): string {
  if (schedule.lastRunAt) return formatSnapTime(schedule.lastRunAt);
  if (schedule.lastRunKey) {
    const parsed = Date.parse(schedule.lastRunKey);
    if (Number.isFinite(parsed)) return formatSnapTime(Math.floor(parsed / 1000));
    return schedule.lastRunKey.replace("T", " ");
  }
  return "Never";
}

export function sortSchedules(schedules: PowerSchedule[]): PowerSchedule[] {
  return [...schedules].sort((a, b) => {
    if (a.time !== b.time) return a.time.localeCompare(b.time);
    return actionLabel(a.action).localeCompare(actionLabel(b.action));
  });
}

function ActionIcon({ action }: { action: PowerSchedule["action"] }) {
  if (action === "stop") return <Square className="size-3.5" />;
  if (action === "shutdown") return <Power className="size-3.5" />;
  return <Play className="size-3.5" />;
}

function actionTone(action: PowerSchedule["action"], enabled: boolean): string {
  if (!enabled) return "bg-white/5 text-muted";
  if (action === "start") return "bg-good/15 text-good";
  if (action === "stop") return "bg-bad/15 text-bad";
  return "bg-warn/15 text-warn";
}

function DayDots({ days }: { days: number[] }) {
  const all = days.length === 0;
  return (
    <div className="flex flex-wrap gap-1" aria-label={all ? "Every day" : undefined}>
      {DAY_LABELS.map((label, i) => {
        const on = all || days.includes(i);
        return (
          <span
            key={label}
            title={label}
            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[10px] font-medium ${
              on
                ? "bg-accent/15 text-accent"
                : "bg-white/[0.03] text-muted/50"
            }`}
          >
            {label.slice(0, 1)}
          </span>
        );
      })}
    </div>
  );
}

export function ScheduleEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-bg/40 px-6 py-10 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted">
        <CalendarClock className="size-5" />
      </div>
      <p className="text-sm font-medium">No schedules yet</p>
      <p className="mt-1 max-w-[16rem] text-xs text-muted">
        Plan automatic start, shut down, or stop for this guest.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-2 sm:min-h-0 sm:px-3.5 sm:py-2 sm:text-xs"
      >
        Add schedule
      </button>
    </div>
  );
}

export function ScheduleRow({
  schedule,
  busy,
  onEdit,
  onDelete,
  onToggle,
}: {
  schedule: PowerSchedule;
  busy?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const enabled = schedule.enabled;

  return (
    <li
      className={`rounded-xl border transition ${
        enabled
          ? "border-line bg-bg/50 hover:border-line-2 hover:bg-surface-2/60"
          : "border-line/70 bg-bg/20 opacity-75"
      }`}
    >
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-stretch sm:gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 pt-0.5">
              <p
                className={`font-mono text-xl font-semibold tabular-nums tracking-tight ${
                  enabled ? "text-ink" : "text-muted"
                }`}
              >
                {schedule.time}
              </p>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${actionTone(
                    schedule.action,
                    enabled,
                  )}`}
                >
                  <ActionIcon action={schedule.action} />
                  {actionLabel(schedule.action)}
                </span>
                {!enabled ? (
                  <span className="text-[11px] text-muted">Paused</span>
                ) : null}
              </div>
              <DayDots days={schedule.days} />
              <p className="text-[11px] text-muted">
                Last run{" "}
                <span className={enabled ? "text-ink/80" : ""}>
                  {lastRunLabel(schedule)}
                </span>
              </p>
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line/70 pt-2 sm:flex-col sm:items-center sm:justify-between sm:border-t-0 sm:pt-0.5">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? "Disable schedule" : "Enable schedule"}
            disabled={busy}
            onClick={onToggle}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg disabled:opacity-40 sm:min-h-0 sm:min-w-0"
          >
            <span
              className={`relative block h-7 w-12 rounded-full transition ${
                enabled ? "bg-accent" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition ${
                  enabled ? "left-[1.35rem]" : "left-0.5"
                }`}
              />
            </span>
          </button>
          <div className="flex gap-1.5">
            <IconBtn label="Edit schedule" disabled={busy} onClick={onEdit}>
              <Pencil className="size-3.5" />
            </IconBtn>
            <IconBtn label="Delete schedule" danger disabled={busy} onClick={onDelete}>
              <Trash2 className="size-3.5" />
            </IconBtn>
          </div>
        </div>
      </div>
    </li>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border transition disabled:opacity-40 sm:size-8 sm:min-h-0 sm:min-w-0 ${
        danger
          ? "border-bad/30 text-bad hover:bg-bad/10"
          : "border-line text-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
