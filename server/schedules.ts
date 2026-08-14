import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pveRequest } from "./proxmox.ts";
import type { Session } from "./session.ts";

export type PowerSchedule = {
  id: string;
  node: string;
  type: "lxc" | "qemu";
  vmid: number;
  name?: string;
  enabled: boolean;
  /** "start" | "shutdown" | "stop" */
  action: "start" | "shutdown" | "stop";
  /** HH:MM 24h local time of the ProxPanel server */
  time: string;
  /** 0=Sun .. 6=Sat, empty = every day */
  days: number[];
  lastRunKey?: string;
};

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
    schedules[idx] = schedule;
  } else {
    schedules.push(schedule);
  }
  await writeAll(schedules);
  return schedule;
}

export async function deleteSchedule(id: string): Promise<boolean> {
  const schedules = await readAll();
  const next = schedules.filter((s) => s.id !== id);
  if (next.length === schedules.length) return false;
  await writeAll(next);
  return true;
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
        await pveRequest(
          session,
          "POST",
          `/nodes/${encodeURIComponent(schedule.node)}/${schedule.type}/${encodeURIComponent(String(schedule.vmid))}/status/${schedule.action}`,
        );
        schedule.lastRunKey = key;
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
