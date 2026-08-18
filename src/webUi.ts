import {
  listServiceCatalog,
  resolveServiceIcon,
} from "./serviceIcon";
import type { GuestType, MarketplaceScript } from "./types";

const HTTPS_PORTS = new Set([443, 8006, 8443, 8834, 9443, 10443]);

export type WebUiTarget = {
  url: string;
  host: string;
  port: number | null;
  label: string | null;
};

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isIpv6(ip: string): boolean {
  return ip.includes(":");
}

export function formatHost(ip: string): string {
  return isIpv6(ip) ? `[${ip}]` : ip;
}

export function webUiUrl(ip: string, port: number | null): string {
  const host = formatHost(ip);
  const https = port != null && HTTPS_PORTS.has(port);
  const protocol = https ? "https" : "http";
  if (port == null || port === 80 || port === 443) {
    return `${protocol}://${host}`;
  }
  return `${protocol}://${host}:${port}`;
}

function kindBonus(scriptKind: MarketplaceScript["kind"], guestType?: GuestType): number {
  if (!guestType) return 0;
  if (guestType === "lxc" && scriptKind === "lxc") return 4;
  if (guestType === "qemu" && scriptKind === "vm") return 4;
  if (guestType === "lxc" && scriptKind === "vm") return -8;
  if (guestType === "qemu" && scriptKind === "lxc") return -8;
  return 0;
}

function scoreScript(
  script: MarketplaceScript,
  guestC: string,
  iconSlugC: string,
  iconLabelC: string,
  guestType?: GuestType,
): number {
  const slugC = compact(script.slug);
  const nameC = compact(script.name);
  if (!slugC && !nameC) return 0;

  let score = 0;
  const bump = (n: number) => {
    if (n > score) score = n;
  };

  if (guestC && (guestC === slugC || guestC === nameC)) bump(100);
  if (iconSlugC && (iconSlugC === slugC || iconSlugC === nameC)) bump(92);
  if (iconLabelC && (iconLabelC === slugC || iconLabelC === nameC)) bump(90);
  if (guestC && slugC.length >= 4 && guestC.startsWith(slugC)) {
    bump(80 + Math.min(slugC.length, 12));
  }
  if (iconSlugC && slugC.length >= 5) {
    const longer = iconSlugC.length >= slugC.length ? iconSlugC : slugC;
    const shorter = iconSlugC.length >= slugC.length ? slugC : iconSlugC;
    if (longer.startsWith(shorter)) bump(78);
  }
  if (
    guestC.length >= 5 &&
    slugC.startsWith(guestC) &&
    slugC.length - guestC.length <= 6
  ) {
    bump(76);
  }
  if (
    guestC.length >= 6 &&
    slugC.includes(guestC) &&
    slugC.length - guestC.length <= 8
  ) {
    bump(74);
  }
  if (
    iconLabelC.length >= 6 &&
    slugC.includes(iconLabelC) &&
    slugC.length - iconLabelC.length <= 8
  ) {
    bump(74);
  }

  if (score <= 0) return 0;

  // Prefer "nextcloud" over "nextcloud-exporter" when the guest is just Nextcloud.
  if (guestC && slugC.startsWith(guestC) && slugC.length > guestC.length + 6) {
    score -= 24;
  }
  if (iconSlugC && slugC.startsWith(iconSlugC) && slugC.length > iconSlugC.length + 6) {
    score -= 18;
  }

  return score + kindBonus(script.kind, guestType);
}

export function resolveWebUiScript(
  scripts: MarketplaceScript[] | undefined,
  opts: {
    name?: string | null;
    tags?: string | null;
    guestType?: GuestType;
    iconSlug?: string | null;
  },
): MarketplaceScript | null {
  if (!scripts?.length) return null;

  const detected = resolveServiceIcon(opts.name, opts.tags);
  const catalog = listServiceCatalog();
  const iconSlug = opts.iconSlug || detected?.slug || "";
  const iconLabel =
    detected?.label ||
    catalog.find((c) => c.slug === iconSlug)?.label ||
    "";

  const guestC = compact(opts.name || "");
  const iconSlugC = compact(iconSlug);
  const iconLabelC = compact(iconLabel);

  let best: { script: MarketplaceScript; score: number } | null = null;
  for (const script of scripts) {
    if (!script.port || script.port <= 0) continue;
    const score = scoreScript(script, guestC, iconSlugC, iconLabelC, opts.guestType);
    if (score < 70) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && compact(script.slug).length < compact(best.script.slug).length)
    ) {
      best = { script, score };
    }
  }
  return best?.script || null;
}

export function resolveGuestWebUi(
  ip: string,
  scripts: MarketplaceScript[] | undefined,
  opts: {
    name?: string | null;
    tags?: string | null;
    guestType?: GuestType;
    iconSlug?: string | null;
  },
): WebUiTarget {
  const script = resolveWebUiScript(scripts, opts);
  const port = script?.port && script.port > 0 ? script.port : null;
  return {
    url: webUiUrl(ip, port),
    host: formatHost(ip),
    port,
    label: script?.name || null,
  };
}
