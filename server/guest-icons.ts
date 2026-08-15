import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export type GuestIconMode = "auto" | "cdn" | "upload" | "none";

export type GuestIconRecord = {
  mode: GuestIconMode;
  /** Dashboard Icons slug when mode is cdn */
  slug?: string;
  /** Filename under data/guest-icons/ when mode is upload */
  file?: string;
  updatedAt: number;
};

export type GuestIconsMap = Record<string, GuestIconRecord>;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(ROOT, "data", "guest-icons.json");
const UPLOAD_DIR = path.join(ROOT, "data", "guest-icons");

export function guestIconKey(node: string, type: string, vmid: number | string): string {
  return `${node}:${type}:${vmid}`;
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "{}\n", "utf8");
  }
}

export async function listGuestIcons(): Promise<GuestIconsMap> {
  await ensureStore();
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as GuestIconsMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeGuestIcons(map: GuestIconsMap): Promise<void> {
  await ensureStore();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(map, null, 2)}\n`, "utf8");
}

export async function getGuestIcon(
  node: string,
  type: string,
  vmid: number | string,
): Promise<GuestIconRecord | null> {
  const map = await listGuestIcons();
  return map[guestIconKey(node, type, vmid)] || null;
}

export async function setGuestIcon(
  node: string,
  type: string,
  vmid: number | string,
  record: Omit<GuestIconRecord, "updatedAt">,
): Promise<GuestIconRecord> {
  const map = await listGuestIcons();
  const key = guestIconKey(node, type, vmid);
  const prev = map[key];
  const next: GuestIconRecord = {
    mode: record.mode,
    slug: record.mode === "cdn" ? record.slug : undefined,
    file: record.mode === "upload" ? record.file : undefined,
    updatedAt: Date.now(),
  };

  // Drop previous upload file when replaced/removed.
  if (prev?.file && prev.file !== next.file) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, prev.file));
    } catch {
      /* ignore */
    }
  }

  if (next.mode === "auto") {
    delete map[key];
  } else {
    map[key] = next;
  }
  await writeGuestIcons(map);
  return next.mode === "auto" ? { mode: "auto", updatedAt: Date.now() } : next;
}

export async function deleteGuestIcon(
  node: string,
  type: string,
  vmid: number | string,
): Promise<void> {
  const map = await listGuestIcons();
  const key = guestIconKey(node, type, vmid);
  const prev = map[key];
  if (!prev) return;
  if (prev.file) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, prev.file));
    } catch {
      /* ignore */
    }
  }
  delete map[key];
  await writeGuestIcons(map);
}

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"]);

export async function saveGuestIconUpload(
  originalName: string,
  buffer: Buffer,
): Promise<string> {
  await ensureStore();
  const ext = path.extname(originalName || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error("Unsupported image type. Use PNG, JPG, WEBP, SVG, or GIF.");
  }
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error("Image must be 2 MB or smaller.");
  }
  const filename = `${randomUUID()}${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return filename;
}

export function guestIconUploadPath(filename: string): string | null {
  const base = path.basename(filename);
  if (base !== filename || base.includes("..")) return null;
  return path.join(UPLOAD_DIR, base);
}
