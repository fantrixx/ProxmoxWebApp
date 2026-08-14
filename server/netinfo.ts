const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

const SKIP_IFACE =
  /^(lo|docker|br-|cni|flannel|calico|kube|weave|cbr|virbr|fwbr|fwln|fwpr|veth|tun|tap|wg|tailscale|zt|dummy|sit|gre|ip6tnl|vnet|lxcbr|podman|nerdctl)/i;

function isIpv4(ip: string): boolean {
  if (!IPV4.test(ip)) return false;
  return ip.split(".").every((part) => {
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function isUnusableIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 127 || a === 0 || a === 255) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function ifacePriority(name: string): number {
  const n = name.toLowerCase();
  if (!n || SKIP_IFACE.test(n)) return -1000;
  if (n === "eth0" || n === "ens18" || n === "ens3" || n === "eno1") return 100;
  if (/^eth\d+$/.test(n)) return 90 - Number(n.slice(3));
  if (/^ens\d+$/.test(n)) return 85;
  if (/^enp\d|^eno\d|^enx/.test(n)) return 80;
  if (n === "ethernet") return 75;
  if (n.startsWith("ethernet")) return 50;
  if (n.startsWith("en")) return 40;
  return 0;
}

function pickPrimaryIpv4(candidates: { ip: string; iface?: string }[]): string[] {
  const usable = candidates.filter(
    (c) => isIpv4(c.ip) && !isUnusableIpv4(c.ip) && ifacePriority(c.iface || "eth0") >= 0,
  );
  if (!usable.length) return [];
  usable.sort((a, b) => ifacePriority(b.iface || "") - ifacePriority(a.iface || ""));
  return [usable[0].ip];
}

export function ipsFromNetConfig(config: Record<string, unknown>): string[] {
  const nets = Object.entries(config)
    .filter(([key, val]) => /^net\d+$/.test(key) && typeof val === "string")
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  for (const [, val] of nets) {
    const match = /(?:^|,)ip=([^,]+)/.exec(String(val));
    const raw = match?.[1];
    if (!raw || raw === "dhcp" || raw === "manual" || raw === "auto") continue;
    const ip = raw.split("/")[0];
    if (isIpv4(ip) && !isUnusableIpv4(ip)) return [ip];
  }
  return [];
}

export function ipsFromLxcIfaces(data: unknown): string[] {
  const list = Array.isArray(data) ? data : [];
  const candidates: { ip: string; iface?: string }[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: string; inet?: string };
    if (!row.inet) continue;
    for (const part of String(row.inet).split(/\s+/)) {
      candidates.push({ ip: part.split("/")[0], iface: row.name });
    }
  }
  return pickPrimaryIpv4(candidates);
}

export function ipsFromQemuAgent(data: unknown): string[] {
  const wrapped = data as { result?: unknown[] } | unknown[] | null;
  const list = Array.isArray(wrapped)
    ? wrapped
    : Array.isArray(wrapped?.result)
      ? wrapped.result
      : [];
  const candidates: { ip: string; iface?: string }[] = [];
  for (const iface of list) {
    if (!iface || typeof iface !== "object") continue;
    const row = iface as {
      name?: string;
      "ip-addresses"?: { "ip-address"?: string; "ip-address-type"?: string }[];
    };
    for (const addr of row["ip-addresses"] || []) {
      if (addr["ip-address-type"] && addr["ip-address-type"] !== "ipv4") continue;
      if (addr["ip-address"]) {
        candidates.push({ ip: addr["ip-address"], iface: row.name });
      }
    }
  }
  return pickPrimaryIpv4(candidates);
}

export function primaryDisk(
  type: string,
  config: Record<string, unknown>,
): string | null {
  if (type === "lxc") return config.rootfs ? "rootfs" : null;
  const keys = Object.keys(config).sort();
  return keys.find((key) => /^(scsi|virtio|sata|ide)\d+$/.test(key)) || null;
}
