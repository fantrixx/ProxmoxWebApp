import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pveRequest, unwrapUpid } from "./proxmox.ts";
import type { Session } from "./session.ts";

export type ScheduleAction = "start" | "shutdown" | "stop" | "backup";
export type BackupMode = "snapshot" | "suspend" | "stop";
export type BackupCompress = "zstd" | "gzip" | "lzo" | "0";

export type PowerSchedule = {
  id: string;
  node: string;
  type: "lxc" | "qemu";
  vmid: number;
  name?: string;
  enabled: boolean;
  /** "start" | "shutdown" | "stop" | "backup" */
  action: ScheduleAction;
  /** HH:MM 24h local time of the ProxPanel server */
  time: string;
  /** 0=Sun .. 6=Sat, empty = every day */
  days: number[];
  /** Required when action is backup — vzdump target storage */
  storage?: string;
  /** vzdump mode; defaults to snapshot (live backup) */
  backupMode?: BackupMode;
  /** vzdump compression; defaults to zstd */
  compress?: BackupCompress;
  lastRunKey?: string;
  /** Unix epoch seconds when the schedule last executed successfully */
  lastRunAt?: number;
};

const POWER_ACTIONS = new Set<ScheduleAction>(["start", "shutdown", "stop"]);
const BACKUP_MODES = new Set<BackupMode>(["snapshot", "suspend", "stop"]);
const BACKUP_COMPRESS = new Set<BackupCompress>(["zstd", "gzip", "lzo", "0"]);

const DATA_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/schedules.json",
);

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readAll(): Promise<PowerSchedule[]> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw) as PowerSchedule[];
  return Array.isArray(parsed) ? parsed : [];
}

async function writeAll(schedules: PowerSchedule[]): Promise<void> {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(schedules, null, 2)}\n`, "utf8");
}

export async function listSchedules(): Promise<PowerSchedule[]> {
  return readAll();
}

export async function upsertSchedule(schedule: PowerSchedule): Promise<PowerSchedule> {
  const schedules = await readAll();
  const idx = schedules.findIndex((s) => s.id === schedule.id);
  if (idx >= 0) {
    const prev = schedules[idx];
    schedules[idx] = {
      ...schedule,
      // Keep run history unless the client explicitly sends new values.
      lastRunKey:
        schedule.lastRunKey !== undefined ? schedule.lastRunKey : prev.lastRunKey,
      lastRunAt: schedule.lastRunAt !== undefined ? schedule.lastRunAt : prev.lastRunAt,
    };
  } else {
    schedules.push(schedule);
  }
  await writeAll(schedules);
  return schedules.find((s) => s.id === schedule.id) || schedule;
}

export async function deleteSchedule(id: string): Promise<boolean> {
  const schedules = await readAll();
  const next = schedules.filter((s) => s.id !== id);
  if (next.length === schedules.length) return false;
  await writeAll(next);
  return true;
}

export function isScheduleAction(value: unknown): value is ScheduleAction {
  return value === "start" || value === "shutdown" || value === "stop" || value === "backup";
}

export function normalizeBackupFields(input: {
  action: ScheduleAction;
  storage?: string;
  backupMode?: string;
  compress?: string;
}): { storage?: string; backupMode?: BackupMode; compress?: BackupCompress } | { error: string } {
  if (input.action !== "backup") {
    return {};
  }
  const storage = String(input.storage || "").trim();
  if (!storage) {
    return { error: "Storage is required for backup schedules." };
  }
  const backupMode = (input.backupMode || "snapshot") as BackupMode;
  if (!BACKUP_MODES.has(backupMode)) {
    return { error: "Invalid backup mode." };
  }
  let compress = (input.compress || "zstd") as BackupCompress | "none";
  if (compress === "none") compress = "0";
  if (!BACKUP_COMPRESS.has(compress as BackupCompress)) {
    return { error: "Invalid compression." };
  }
  return { storage, backupMode, compress: compress as BackupCompress };
}

function todayRunKey(time: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T${time}`;
}

function matchesSchedule(schedule: PowerSchedule, now: Date): boolean {
  if (!schedule.enabled) return false;
  const [hh, mm] = schedule.time.split(":");
  if (hh == null || mm == null) return false;
  if (now.getHours() !== Number(hh) || now.getMinutes() !== Number(mm)) return false;
  if (schedule.days.length > 0 && !schedule.days.includes(now.getDay())) return false;
  const key = todayRunKey(schedule.time);
  return schedule.lastRunKey !== key;
}

async function runPowerAction(session: Session, schedule: PowerSchedule): Promise<void> {
  await pveRequest(
    session,
    "POST",
    `/nodes/${encodeURIComponent(schedule.node)}/${schedule.type}/${encodeURIComponent(String(schedule.vmid))}/status/${schedule.action}`,
  );
}

async function runBackupAction(session: Session, schedule: PowerSchedule): Promise<void> {
  const storage = String(schedule.storage || "").trim();
  if (!storage) {
    throw new Error("Backup schedule is missing storage.");
  }
  const vmid = String(schedule.vmid);
  const node = schedule.node;

  await pveRequest(
    session,
    "GET",
    `/nodes/${encodeURIComponent(node)}/${schedule.type}/${encodeURIComponent(vmid)}/status/current`,
  );

  const payload = {
    vmid,
    storage,
    mode: schedule.backupMode || "snapshot",
    compress: schedule.compress || "zstd",
    remove: "0",
  };

  console.info("[schedules] starting vzdump", {
    node,
    type: schedule.type,
    ...payload,
  });

  const raw = await pveRequest(
    session,
    "POST",
    `/nodes/${encodeURIComponent(node)}/vzdump`,
    payload,
  );

  if (raw === "OK" || raw === "ok") {
    throw new Error(
      `Proxmox did not start a backup for guest ${vmid} on node "${node}" (got OK with no task).`,
    );
  }

  const upid = unwrapUpid(raw);
  if (!upid) {
    throw new Error("Proxmox did not return a backup task id.");
  }

  console.info("[schedules] vzdump started", { node, vmid, upid });
}

export function startScheduleRunner(getSession: () => Session | null): void {
  const tick = async () => {
    const session = getSession();
    if (!session) return;

    const now = new Date();
    const schedules = await readAll();
    let changed = false;

    for (const schedule of schedules) {
      if (!matchesSchedule(schedule, now)) continue;
      const key = todayRunKey(schedule.time);
      try {
        if (schedule.action === "backup") {
          await runBackupAction(session, schedule);
        } else if (POWER_ACTIONS.has(schedule.action)) {
          await runPowerAction(session, schedule);
        } else {
          console.error(`[schedules] Unknown action ${schedule.action} for ${schedule.id}`);
          continue;
        }
        schedule.lastRunKey = key;
        schedule.lastRunAt = Math.floor(Date.now() / 1000);
        changed = true;
      } catch (err) {
        console.error(
          `[schedules] Failed ${schedule.action} ${schedule.type}/${schedule.vmid} on ${schedule.node}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (changed) await writeAll(schedules);
  };

  void tick();
  setInterval(() => {
    void tick();
  }, 30_000);
}
