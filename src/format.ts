export function formatCompactCount(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  const abs = Math.abs(n);
  const trim = (value: number) => value.toFixed(1).replace(/\.0$/, "");
  if (abs >= 1_000_000) return `${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(abs / 1_000)}k`;
  return String(Math.round(abs));
}

export function formatRelativeTime(epochSec?: number): string {
  if (!epochSec) return "—";
  const delta = Date.now() - epochSec * 1000;
  const sec = Math.round(delta / 1000);
  if (sec < 45) return "just now";
  if (sec < 90) return "a minute ago";
  const min = Math.round(sec / 60);
  if (min < 50) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr === 1) return "an hour ago";
  if (hr < 24) return `${hr} hours ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  return formatSnapTime(epochSec);
}

export function formatBytes(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let i = 0;
  let v = abs;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export function formatBytesRate(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n) || n < 0) return "—";
  return `${formatBytes(n)}/s`;
}

export function formatPct(fraction: number | undefined | null): string {
  if (fraction == null || Number.isNaN(fraction)) return "—";
  return `${(fraction * 100).toFixed(1)} %`;
}

export function usagePct(used?: number, max?: number): number {
  if (!max || max <= 0 || used == null) return 0;
  return Math.min(100, Math.max(0, (used / max) * 100));
}

export function cpuPct(cpu?: number): number {
  if (cpu == null || Number.isNaN(cpu)) return 0;
  return Math.min(100, Math.max(0, cpu * 100));
}

export function formatUptime(seconds?: number): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function guestLabel(type: string): string {
  return type === "lxc" ? "CT" : "VM";
}

export function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatSnapTime(epoch?: number): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function statusLabel(status?: string): string {
  switch ((status || "").toLowerCase()) {
    case "running":
      return "running";
    case "stopped":
      return "stopped";
    case "paused":
      return "paused";
    case "suspended":
      return "suspended";
    case "online":
      return "online";
    case "offline":
      return "offline";
    case "shutting down":
      return "shutting down";
    case "stopping":
      return "stopping";
    case "starting":
      return "starting";
    case "rebooting":
      return "rebooting";
    case "creating":
      return "creating";
    case "migrating":
      return "migrating";
    default:
      return status || "unknown";
  }
}

/** Resolve the status shown on cards / badges from Proxmox + local pending actions. */
export function guestVisualStatus(opts: {
  status?: string;
  qmpstatus?: string;
  lock?: string;
  pending?: string;
}): string {
  const lock = (opts.lock || "").toLowerCase();
  if (lock.includes("creat") || lock === "clone") return "creating";
  if (lock.includes("migrat")) return "migrating";
  if (lock === "suspended" || lock.includes("suspend")) return "suspended";

  const qmp = (opts.qmpstatus || "").toLowerCase();
  if (qmp === "shutdown") return "shutting down";
  if (qmp === "prelaunch") return "starting";
  if (qmp === "paused") return "paused";
  if (qmp === "suspended") return "suspended";

  const pending = (opts.pending || "").toLowerCase();
  if (pending) return pending;

  const status = (opts.status || "").toLowerCase();
  if (status) return status;
  return "unknown";
}
