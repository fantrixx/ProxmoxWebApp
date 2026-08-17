import { fetch as undiciFetch } from "undici";

const PB_URL = "https://db.community-scripts.org";
const GH_RAW = "https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main";
const GH_RAW_DEV = "https://raw.githubusercontent.com/community-scripts/ProxmoxVED/main";
const CACHE_MS = 30 * 60 * 1000;
const CACHE_ERR_MS = 60 * 1000;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 80;

export type HelperScriptKind = "lxc" | "vm" | "pve" | "addon" | "turnkey";

export type HelperScriptNote = {
  text: string;
  type: "info" | "warning";
};

export type HelperScript = {
  slug: string;
  name: string;
  description: string;
  logo: string;
  website: string;
  documentation: string;
  kind: HelperScriptKind;
  categories: { id: string; name: string }[];
  privileged: boolean;
  updateable: boolean;
  arm: boolean;
  port: number | null;
  os: string;
  osVersion: string;
  cpu: number;
  ramMb: number;
  diskGb: number;
  defaultUser: string;
  defaultPassword: string;
  notes: HelperScriptNote[];
  hasAlpine: boolean;
  command: string;
  alpineCommand: string | null;
  scriptUrl: string;
  pageUrl: string;
};

export type HelperCatalog = {
  scripts: HelperScript[];
  categories: { id: string; name: string }[];
  fetchedAt: number;
  source: string;
};

type CacheEntry = {
  catalog: HelperCatalog;
  until: number;
};

let cache: CacheEntry | null = null;
let inflight: Promise<HelperCatalog> | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isKind(value: string): value is HelperScriptKind {
  return (
    value === "lxc" ||
    value === "vm" ||
    value === "pve" ||
    value === "addon" ||
    value === "turnkey"
  );
}

export function isSafeSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG && SLUG_RE.test(slug);
}

function scriptDir(kind: HelperScriptKind): string {
  switch (kind) {
    case "vm":
      return "vm";
    case "pve":
      return "tools/pve";
    case "addon":
      return "tools/addon";
    case "turnkey":
      return "turnkey";
    default:
      return "ct";
  }
}

function rawBase(isDev: boolean): string {
  return isDev ? GH_RAW_DEV : GH_RAW;
}

function scriptFile(kind: HelperScriptKind, slug: string, alpine: boolean): string {
  const dir = scriptDir(kind);
  const file = alpine ? `alpine-${slug}.sh` : `${slug}.sh`;
  return `${dir}/${file}`;
}

function isAllowedScriptPath(path: string): boolean {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return false;
  }
  const allowed =
    /^(ct|vm|turnkey|tools\/pve|tools\/addon)\/(?:alpine-)?[a-z0-9]+(?:-[a-z0-9]+)*\.sh$/;
  return allowed.test(path);
}

function installCommand(scriptPath: string, isDev: boolean): string {
  return `bash -c "$(curl -fsSL ${rawBase(isDev)}/${scriptPath})"`;
}

function httpsUrl(value: string): string {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

function mapNotes(raw: unknown): HelperScriptNote[] {
  if (!Array.isArray(raw)) return [];
  const notes: HelperScriptNote[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    const text = asString(rec?.text);
    if (!text) continue;
    notes.push({
      text,
      type: rec?.type === "warning" ? "warning" : "info",
    });
  }
  return notes.slice(0, 8);
}

function mapScript(raw: unknown): HelperScript | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  if (rec.is_deleted === true || rec.is_disabled === true) return null;

  const slug = asString(rec.slug).toLowerCase();
  if (!isSafeSlug(slug)) return null;

  const expand = asRecord(rec.expand);
  const typeRec = asRecord(expand?.type);
  const kindRaw = asString(typeRec?.type).toLowerCase();
  const kind: HelperScriptKind = isKind(kindRaw)
    ? kindRaw
    : kindRaw === "ct"
      ? "lxc"
      : "lxc";

  const methods = Array.isArray(rec.install_methods) ? rec.install_methods : [];
  let defaultMethod: Record<string, unknown> | null = null;
  let alpineMethod: Record<string, unknown> | null = null;
  for (const method of methods) {
    const m = asRecord(method);
    if (!m) continue;
    const t = asString(m.type).toLowerCase();
    if (t === "alpine") alpineMethod = m;
    else if (!defaultMethod) defaultMethod = m;
  }

  const resources = asRecord(defaultMethod?.resources) || {};
  const isDev = rec.is_dev === true;

  const provided = asString(defaultMethod?.script);
  const defaultPath = isAllowedScriptPath(provided)
    ? provided
    : scriptFile(kind, slug, false);
  if (!isAllowedScriptPath(defaultPath)) return null;

  const alpineProvided = asString(alpineMethod?.script);
  const alpinePath =
    alpineMethod &&
    (isAllowedScriptPath(alpineProvided)
      ? alpineProvided
      : scriptFile(kind, slug, true));
  const alpineOk = Boolean(alpinePath && isAllowedScriptPath(alpinePath));

  const categories: { id: string; name: string }[] = [];
  const catRaw = expand?.categories;
  const catList = Array.isArray(catRaw) ? catRaw : [];
  for (const cat of catList) {
    const c = asRecord(cat);
    const id = asString(c?.id);
    const name = asString(c?.name);
    if (id && name) categories.push({ id, name });
  }

  const port = asNumber(rec.port) || asNumber(rec.interface_port);
  const name = asString(rec.name) || slug;

  return {
    slug,
    name,
    description: asString(rec.description),
    logo: httpsUrl(asString(rec.logo)),
    website: httpsUrl(asString(rec.website)),
    documentation: httpsUrl(asString(rec.documentation)),
    kind,
    categories,
    privileged: asBool(rec.privileged),
    updateable: rec.updateable !== false,
    arm: asBool(rec.has_arm) || (Array.isArray(rec.architectures) && rec.architectures.includes("arm64")),
    port: port > 0 ? port : null,
    os: asString(resources.os) || "Debian",
    osVersion: String(resources.version ?? ""),
    cpu: asNumber(resources.cpu),
    ramMb: asNumber(resources.ram),
    diskGb: asNumber(resources.hdd),
    defaultUser: asString(rec.default_user),
    defaultPassword: asString(rec.default_passwd),
    notes: mapNotes(rec.notes),
    hasAlpine: alpineOk,
    command: installCommand(defaultPath, isDev),
    alpineCommand: alpineOk && alpinePath ? installCommand(alpinePath, isDev) : null,
    scriptUrl: `${rawBase(isDev)}/${defaultPath}`,
    pageUrl: `https://community-scripts.org/scripts/${encodeURIComponent(slug)}`,
  };
}

async function fetchPage(page: number, perPage: number): Promise<{
  items: unknown[];
  totalPages: number;
}> {
  const filter = "is_deleted=false&&is_disabled=false";
  const url =
    `${PB_URL}/api/collections/script_scripts/records` +
    `?page=${page}&perPage=${perPage}` +
    `&filter=${encodeURIComponent(filter)}` +
    `&expand=${encodeURIComponent("type,categories")}` +
    `&sort=name`;
  const res = await undiciFetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ProxPanel-Marketplace" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Helper Scripts catalog returned HTTP ${res.status}.`);
  }
  const body = (await res.json()) as {
    items?: unknown[];
    totalPages?: number;
  };
  return {
    items: Array.isArray(body.items) ? body.items : [],
    totalPages: Math.max(1, Number(body.totalPages) || 1),
  };
}

async function loadCatalog(): Promise<HelperCatalog> {
  const items: unknown[] = [];
  const perPage = 200;
  const first = await fetchPage(1, perPage);
  items.push(...first.items);
  for (let page = 2; page <= first.totalPages; page++) {
    const next = await fetchPage(page, perPage);
    items.push(...next.items);
  }

  const scripts: HelperScript[] = [];
  const catMap = new Map<string, string>();
  for (const item of items) {
    const mapped = mapScript(item);
    if (!mapped) continue;
    scripts.push(mapped);
    for (const cat of mapped.categories) {
      if (!catMap.has(cat.id)) catMap.set(cat.id, cat.name);
    }
  }

  scripts.sort((a, b) => a.name.localeCompare(b.name));
  const categories = [...catMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    scripts,
    categories,
    fetchedAt: Date.now(),
    source: "community-scripts.org",
  };
}

export async function getHelperCatalog(refresh = false): Promise<HelperCatalog> {
  if (!refresh && cache && Date.now() < cache.until) return cache.catalog;
  if (!refresh && inflight) return inflight;

  inflight = loadCatalog()
    .then((catalog) => {
      cache = { catalog, until: Date.now() + CACHE_MS };
      return catalog;
    })
    .catch((err) => {
      if (cache) {
        cache = { catalog: cache.catalog, until: Date.now() + CACHE_ERR_MS };
        return cache.catalog;
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function findHelperScript(
  catalog: HelperCatalog,
  slug: string,
): HelperScript | undefined {
  const key = slug.trim().toLowerCase();
  if (!isSafeSlug(key)) return undefined;
  return catalog.scripts.find((s) => s.slug === key);
}

export function commandForScript(
  script: HelperScript,
  alpine: boolean,
): string {
  if (alpine && script.alpineCommand) return script.alpineCommand;
  return script.command;
}
