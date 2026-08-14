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
  if (d > 0) return `${d} T ${h} Std`;
  if (h > 0) return `${h} Std ${m} Min`;
  return `${m} Min`;
}

export function guestLabel(type: string): string {
  return type === "lxc" ? "CT" : "VM";
}

export function formatSnapTime(epoch?: number): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function statusLabel(status?: string): string {
  switch (status) {
    case "running":
      return "läuft";
    case "stopped":
      return "gestoppt";
    case "paused":
      return "pausiert";
    case "online":
      return "online";
    case "offline":
      return "offline";
    default:
      return status || "unbekannt";
  }
}
