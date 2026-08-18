import type { PveTask } from "./types";

/** UPID:<node>:<pid>:<pstart>:<starttime>:<type>:<id>:<user> */
export function parseUpid(upid: string): {
  node?: string;
  type?: string;
  id?: string;
  user?: string;
} {
  if (!upid.startsWith("UPID:")) return {};
  const parts = upid.split(":");
  return {
    node: parts[1],
    type: parts[5],
    id: parts[6] || undefined,
    user: parts.slice(7).join(":").replace(/:$/, "") || undefined,
  };
}

export type TaskKind =
  | "backup"
  | "restore"
  | "power"
  | "snapshot"
  | "migrate"
  | "clone"
  | "host"
  | "other";

export type TaskOutcome = "running" | "ok" | "fail";

export function taskOutcome(task: PveTask): TaskOutcome {
  const s = (task.status || "").toLowerCase();
  if (s === "running") return "running";
  if (!s || s === "ok" || s === "stopped") return "ok";
  if (s.includes("warn")) return "ok";
  return "fail";
}

export function taskKind(type?: string): TaskKind {
  const t = (type || "").toLowerCase();
  if (t === "vzdump") return "backup";
  if (t.includes("restore")) return "restore";
  if (
    t.includes("start") ||
    t.includes("stop") ||
    t.includes("shutdown") ||
    t.includes("reboot") ||
    t.includes("reset") ||
    t.includes("suspend") ||
    t.includes("resume")
  ) {
    return "power";
  }
  if (t.includes("snapshot") || t.includes("rollback")) return "snapshot";
  if (t.includes("migrat")) return "migrate";
  if (t.includes("clone")) return "clone";
  if (t === "aptupdate" || t === "aptupgrade" || t.includes("update")) return "host";
  return "other";
}

function targetName(
  task: PveTask,
  names: Map<string, string>,
): string | null {
  const parsed = parseUpid(task.upid);
  const id = task.id || parsed.id;
  if (!id || id === "-") return null;
  const named = names.get(id);
  if (named) return named;
  if (/^\d+$/.test(id)) {
    const type = (task.type || parsed.type || "").toLowerCase();
    const isVm = type.startsWith("qm");
    return isVm ? `VM ${id}` : `container ${id}`;
  }
  return id;
}

export function describeTask(
  task: PveTask,
  names: Map<string, string>,
): { title: string; detail: string; kind: TaskKind; outcome: TaskOutcome } {
  const parsed = parseUpid(task.upid);
  const type = (task.type || parsed.type || "").toLowerCase();
  const node = task.node || parsed.node || "the host";
  const who = task.user || parsed.user;
  const name = targetName(task, names);
  const outcome = taskOutcome(task);
  const kind = taskKind(type);
  const running = outcome === "running";
  const fail = outcome === "fail";

  const verb = (doing: string, done: string, failed: string) => {
    if (running) return doing;
    if (fail) return failed;
    return done;
  };

  let title: string;
  switch (type) {
    case "vzdump":
      title = verb(
        name ? `Backing up ${name}…` : "Backup running…",
        name ? `${name} was backed up` : "Backup finished",
        name ? `Backup of ${name} failed` : "Backup failed",
      );
      break;
    case "qmrestore":
    case "vzrestore":
      title = verb(
        name ? `Restoring ${name}…` : "Restore running…",
        name ? `${name} was restored` : "Restore finished",
        name ? `Couldn’t restore ${name}` : "Restore failed",
      );
      break;
    case "qmstart":
    case "vzstart":
    case "startall":
      title = verb(
        name ? `Starting ${name}…` : "Starting guests…",
        name ? `${name} started` : "Guests started",
        name ? `Couldn’t start ${name}` : "Start failed",
      );
      break;
    case "qmstop":
    case "vzstop":
    case "stopall":
      title = verb(
        name ? `Stopping ${name}…` : "Stopping guests…",
        name ? `${name} was stopped` : "Guests stopped",
        name ? `Couldn’t stop ${name}` : "Stop failed",
      );
      break;
    case "qmshutdown":
    case "vzshutdown":
      title = verb(
        name ? `Shutting down ${name}…` : "Shutdown running…",
        name ? `${name} shut down` : "Shutdown finished",
        name ? `Couldn’t shut down ${name}` : "Shutdown failed",
      );
      break;
    case "qmreboot":
    case "qmreset":
    case "vzreboot":
      title = verb(
        name ? `Restarting ${name}…` : "Restart running…",
        name ? `${name} restarted` : "Restart finished",
        name ? `Couldn’t restart ${name}` : "Restart failed",
      );
      break;
    case "qmsuspend":
      title = verb(
        name ? `Pausing ${name}…` : "Pause running…",
        name ? `${name} was paused` : "Guest paused",
        name ? `Couldn’t pause ${name}` : "Pause failed",
      );
      break;
    case "qmresume":
      title = verb(
        name ? `Resuming ${name}…` : "Resume running…",
        name ? `${name} resumed` : "Guest resumed",
        name ? `Couldn’t resume ${name}` : "Resume failed",
      );
      break;
    case "qmsnapshot":
    case "vzsnapshot":
      title = verb(
        name ? `Taking a snapshot of ${name}…` : "Snapshot running…",
        name ? `Snapshot of ${name} saved` : "Snapshot saved",
        name ? `Snapshot of ${name} failed` : "Snapshot failed",
      );
      break;
    case "qmdelsnapshot":
    case "vzdelsnapshot":
      title = verb(
        name ? `Removing a snapshot of ${name}…` : "Removing snapshot…",
        name ? `Snapshot of ${name} removed` : "Snapshot removed",
        name ? `Couldn’t remove snapshot of ${name}` : "Couldn’t remove snapshot",
      );
      break;
    case "qmrollback":
    case "vzrollback":
      title = verb(
        name ? `Rolling ${name} back…` : "Rollback running…",
        name ? `${name} was rolled back` : "Rollback finished",
        name ? `Rollback of ${name} failed` : "Rollback failed",
      );
      break;
    case "qmclone":
    case "vzclone":
    case "imgcopy":
      title = verb(
        name ? `Copying ${name}…` : "Copy running…",
        name ? `${name} was copied` : "Copy finished",
        name ? `Couldn’t copy ${name}` : "Copy failed",
      );
      break;
    case "qmmove":
    case "vzmove":
      title = verb(
        name ? `Moving disks for ${name}…` : "Moving disks…",
        name ? `Disks for ${name} were moved` : "Disks moved",
        name ? `Couldn’t move disks for ${name}` : "Move failed",
      );
      break;
    case "migrate":
    case "qmigrate":
      title = verb(
        name ? `Moving ${name} to another node…` : "Migration running…",
        name ? `${name} was moved to another node` : "Migration finished",
        name ? `Couldn’t move ${name}` : "Migration failed",
      );
      break;
    case "aptupdate":
      title = verb(
        `Checking updates on ${node}…`,
        `Package list on ${node} was refreshed`,
        `Couldn’t refresh packages on ${node}`,
      );
      break;
    default: {
      const raw = type || "task";
      const label = raw.replace(/^qm/, "VM ").replace(/^vz/, "CT ");
      title = verb(
        name ? `${label} on ${name}…` : `${label} running…`,
        name ? `${label} finished for ${name}` : `${label} finished`,
        name ? `${label} failed for ${name}` : `${label} failed`,
      );
    }
  }

  const bits = [node];
  if (who && !who.startsWith("root@")) bits.push(who);
  else if (who) bits.push("root");
  return { title, detail: bits.join(" · "), kind, outcome };
}

export function summarizeSince(tasks: PveTask[]): string[] {
  const lines: string[] = [];
  const running = tasks.filter((t) => taskOutcome(t) === "running").length;
  const failed = tasks.filter((t) => taskOutcome(t) === "fail").length;
  const backups = tasks.filter((t) => taskKind(t.type) === "backup" && taskOutcome(t) === "ok").length;
  const power = tasks.filter((t) => taskKind(t.type) === "power" && taskOutcome(t) === "ok").length;
  const snapshots = tasks.filter((t) => taskKind(t.type) === "snapshot" && taskOutcome(t) === "ok").length;

  if (running) lines.push(`${running} still running`);
  if (backups) lines.push(`${backups} backup${backups === 1 ? "" : "s"} finished`);
  if (power) lines.push(`${power} start/stop/restart${power === 1 ? "" : "s"}`);
  if (snapshots) lines.push(`${snapshots} snapshot${snapshots === 1 ? "" : "s"}`);
  if (failed) lines.push(`${failed} failed`);
  if (!lines.length) lines.push("Nothing notable");
  return lines;
}
