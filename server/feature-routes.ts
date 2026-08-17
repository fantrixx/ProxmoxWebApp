import type { Express, Request, Response, NextFunction } from "express";
import { createReadStream } from "node:fs";
import { openAsBlob } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import { pveFormUpload, pveRequest, unwrapUpid } from "./proxmox.ts";
import {
  deleteGuestIcon,
  guestIconUploadPath,
  listGuestIcons,
  saveGuestIconUpload,
  setGuestIcon,
  type GuestIconMode,
} from "./guest-icons.ts";
import {
  deleteSchedule,
  isScheduleAction,
  isScheduleAutomationReady,
  listSchedules,
  normalizeBackupFields,
  upsertSchedule,
  type PowerSchedule,
} from "./schedules.ts";
import type { Session } from "./session.ts";
import {
  commandForScript,
  findHelperScript,
  getHelperCatalog,
  isSafeSlug,
} from "./helper-scripts.ts";

const mediaUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 64 * 1024 * 1024 * 1024 },
});

const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

type RouteHelpers = {
  requireSession: (req: Request, res: Response, next: NextFunction) => void;
  sessionOf: (req: Request) => Session;
  param: (value: string | string[] | undefined) => string;
  sendError: (res: Response, err: unknown) => void;
  awaitOptionalTask: (
    session: Session,
    node: string,
    raw: unknown,
    timeoutMs?: number,
  ) => Promise<{ status: string; exitstatus?: string } | null>;
};

type StorageRow = {
  storage: string;
  content?: string;
  enabled?: number;
  shared?: number;
};

type ContentRow = {
  volid: string;
  content?: string;
  size?: number;
  ctime?: number;
  format?: string;
  notes?: string;
  vmid?: number;
};

function parseVolid(volid: string): { storage: string; volname: string } {
  const idx = volid.indexOf(":");
  if (idx < 0) return { storage: volid, volname: volid };
  return { storage: volid.slice(0, idx), volname: volid.slice(idx + 1) };
}

function storageHasContent(content: string | undefined, kind: string): boolean {
  if (!content) return false;
  return content.split(",").map((s) => s.trim()).includes(kind);
}

async function listNodes(session: Session): Promise<string[]> {
  const nodes = await pveRequest<{ node: string }[]>(session, "GET", "/nodes");
  return (nodes || []).map((n) => n.node);
}

async function listNodeStorages(session: Session, node: string): Promise<StorageRow[]> {
  return (
    (await pveRequest<StorageRow[]>(
      session,
      "GET",
      `/nodes/${encodeURIComponent(node)}/storage`,
    )) || []
  );
}

async function listMediaByContent(
  session: Session,
  contentKind: "iso" | "vztmpl",
): Promise<
  {
    node: string;
    storage: string;
    volid: string;
    size?: number;
    ctime?: number;
    format?: string;
    notes?: string;
  }[]
> {
  const items: {
    node: string;
    storage: string;
    volid: string;
    size?: number;
    ctime?: number;
    format?: string;
    notes?: string;
  }[] = [];

  const nodes = await listNodes(session);
  for (const node of nodes) {
    const storages = await listNodeStorages(session, node);
    for (const store of storages) {
      if (store.enabled === 0) continue;
      if (!storageHasContent(store.content, contentKind)) continue;
      try {
        const rows = await pveRequest<ContentRow[]>(
          session,
          "GET",
          `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(store.storage)}/content`,
          { content: contentKind },
        );
        for (const row of rows || []) {
          items.push({
            node,
            storage: store.storage,
            volid: row.volid,
            size: row.size,
            ctime: row.ctime,
            format: row.format,
            notes: row.notes,
          });
        }
      } catch {
        /* skip unavailable storage */
      }
    }
  }

  return items;
}

async function listBackupStorages(session: Session): Promise<
  { node: string; storage: string; shared?: number }[]
> {
  const out: { node: string; storage: string; shared?: number }[] = [];
  const seen = new Set<string>();
  const nodes = await listNodes(session);

  for (const node of nodes) {
    const storages = await listNodeStorages(session, node);
    for (const store of storages) {
      if (store.enabled === 0) continue;
      if (!storageHasContent(store.content, "backup")) continue;
      const key = `${node}:${store.storage}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ node, storage: store.storage, shared: store.shared });
    }
  }

  return out;
}

async function listGuestBackups(
  session: Session,
  node: string,
  vmid: number,
): Promise<(ContentRow & { node: string; storage: string })[]> {
  const backups: (ContentRow & { node: string; storage: string })[] = [];
  const storages = await listNodeStorages(session, node);

  for (const store of storages) {
    if (store.enabled === 0) continue;
    if (!storageHasContent(store.content, "backup")) continue;
    try {
      const rows = await pveRequest<ContentRow[]>(
        session,
        "GET",
        `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(store.storage)}/content`,
        { content: "backup", vmid },
      );
      for (const row of rows || []) {
        const { storage } = parseVolid(row.volid);
        backups.push({
          ...row,
          volid: row.volid,
          node,
          storage: storage || store.storage,
        });
      }
    } catch {
      /* skip */
    }
  }

  return backups;
}

function vmidFromBackupVolid(volid: string): number | undefined {
  const match = /vzdump-(?:qemu|lxc)-(\d+)-/i.exec(volid);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

async function listAllBackupItems(
  session: Session,
): Promise<(ContentRow & { node: string; storage: string })[]> {
  const items: (ContentRow & { node: string; storage: string })[] = [];
  const seen = new Set<string>();
  const nodes = await listNodes(session);

  for (const node of nodes) {
    const storages = await listNodeStorages(session, node);
    for (const store of storages) {
      if (store.enabled === 0) continue;
      if (!storageHasContent(store.content, "backup")) continue;
      const dedupeKey = store.shared ? `shared:${store.storage}` : `${node}:${store.storage}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      try {
        const rows = await pveRequest<ContentRow[]>(
          session,
          "GET",
          `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(store.storage)}/content`,
          { content: "backup" },
        );
        for (const row of rows || []) {
          const { storage } = parseVolid(row.volid);
          const vmid = row.vmid ?? vmidFromBackupVolid(row.volid);
          items.push({
            ...row,
            vmid,
            volid: row.volid,
            node,
            storage: storage || store.storage,
          });
        }
      } catch {
        /* skip unavailable storage */
      }
    }
  }

  return items;
}

function findCdromDrive(config: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(config)) {
    if (!/^(ide|sata|scsi)\d+$/i.test(key)) continue;
    const str = String(value);
    if (str.includes("media=cdrom") || str.includes(".iso")) return key;
  }
  return null;
}

async function listMediaStorages(
  session: Session,
  contentKind: "iso" | "vztmpl" | "images" | "rootdir",
): Promise<{ node: string; storage: string; shared?: number }[]> {
  const out: { node: string; storage: string; shared?: number }[] = [];
  const seen = new Set<string>();
  const nodes = await listNodes(session);

  for (const node of nodes) {
    const storages = await listNodeStorages(session, node);
    for (const store of storages) {
      if (store.enabled === 0) continue;
      if (!storageHasContent(store.content, contentKind)) continue;
      const key = `${node}:${store.storage}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ node, storage: store.storage, shared: store.shared });
    }
  }

  return out;
}

type IsoUsageEntry = {
  node: string;
  vmid: number;
  name: string;
  drive: string;
};

function isoVolidFromDrive(value: string): string | null {
  const part = value.split(",")[0]?.trim() || "";
  if (!part || part === "none" || part === "cdrom") return null;
  if (part.includes(".iso") || /:iso\//i.test(part)) return part;
  return null;
}

async function listIsoUsage(session: Session): Promise<Record<string, IsoUsageEntry[]>> {
  type ResourceRow = {
    type?: string;
    node?: string;
    vmid?: number;
    name?: string;
    template?: number;
  };

  const resources =
    (await pveRequest<ResourceRow[]>(session, "GET", "/cluster/resources")) || [];
  const vms = resources.filter(
    (r) =>
      r.type === "qemu" &&
      r.node &&
      r.vmid != null &&
      !r.template,
  );

  const usage: Record<string, IsoUsageEntry[]> = {};

  await Promise.all(
    vms.map(async (vm) => {
      try {
        const config = await pveRequest<Record<string, unknown>>(
          session,
          "GET",
          `/nodes/${encodeURIComponent(vm.node!)}/qemu/${encodeURIComponent(String(vm.vmid))}/config`,
        );
        for (const [key, value] of Object.entries(config || {})) {
          if (!/^(ide|sata|scsi)\d+$/i.test(key)) continue;
          const volid = isoVolidFromDrive(String(value));
          if (!volid) continue;
          const entry: IsoUsageEntry = {
            node: vm.node!,
            vmid: vm.vmid!,
            name: vm.name || `VM ${vm.vmid}`,
            drive: key,
          };
          (usage[volid] ||= []).push(entry);
        }
      } catch {
        /* skip unreachable VMs */
      }
    }),
  );

  return usage;
}

async function listRecentTasks(session: Session, limit = 50): Promise<
  {
    upid: string;
    node?: string;
    type?: string;
    status?: string;
    user?: string;
    starttime?: number;
    endtime?: number;
    id?: string;
  }[]
> {
  type TaskRow = {
    upid: string;
    node?: string;
    type?: string;
    status?: string;
    user?: string;
    starttime?: number;
    endtime?: number;
    id?: string;
  };
  const byUpid = new Map<string, TaskRow>();

  const addRows = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const task = row as TaskRow;
      if (!task.upid) continue;
      byUpid.set(task.upid, task);
    }
  };

  try {
    addRows(
      await pveRequest(session, "GET", "/cluster/tasks", {
        limit,
      }),
    );
  } catch {
    /* fall through to per-node */
  }

  // Always merge node tasks — cluster/tasks can be empty with limited tokens.
  {
    const nodes = await listNodes(session);
    for (const node of nodes) {
      try {
        addRows(
          await pveRequest(session, "GET", `/nodes/${encodeURIComponent(node)}/tasks`, {
            limit,
            source: "all",
          }),
        );
      } catch {
        /* skip node */
      }
    }
  }

  return [...byUpid.values()].sort(
    (a, b) => (b.starttime || 0) - (a.starttime || 0),
  );
}

async function findRecentGuestTask(
  session: Session,
  node: string,
  typeHint: string,
  vmid: string,
): Promise<string | null> {
  try {
    const rows =
      (await pveRequest<
        { upid?: string; type?: string; id?: string; status?: string; starttime?: number }[]
      >(session, "GET", `/nodes/${encodeURIComponent(node)}/tasks`, {
        limit: 20,
        source: "all",
      })) || [];
    const match = rows.find((t) => {
      if (!t.upid) return false;
      const idMatch = String(t.id || "") === String(vmid);
      const type = String(t.type || "").toLowerCase();
      const typeOk =
        type === typeHint ||
        type.includes(typeHint) ||
        (typeHint === "vzdump" && type.includes("dump"));
      return idMatch && typeOk;
    });
    return match?.upid || null;
  } catch {
    return null;
  }
}

export function registerFeatureRoutes(app: Express, helpers: RouteHelpers): void {
  const { requireSession, sessionOf, param, sendError } = helpers;

  app.get("/api/tasks", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const limit = Number(req.query.limit ?? 50);
      const tasks = await listRecentTasks(session, Number.isFinite(limit) ? limit : 50);
      res.json({ tasks });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/task-status", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = String(req.query.node || "");
      const upid = String(req.query.upid || "");
      if (!node || !upid) {
        res.status(400).json({ error: "node and upid are required." });
        return;
      }
      const status = await pveRequest(
        session,
        "GET",
        `/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`,
      );
      res.json(status ?? {});
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/task-log", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = String(req.query.node || "");
      const upid = String(req.query.upid || "");
      if (!node || !upid) {
        res.status(400).json({ error: "node and upid are required." });
        return;
      }
      const log = await pveRequest(
        session,
        "GET",
        `/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/log`,
        { start: 0, limit: 500 },
      );
      res.json({ log: log || [] });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Legacy path routes (UPIDs with colons break path matching — prefer query routes above).
  app.get("/api/tasks/:node/:upid/status", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const upid = decodeURIComponent(param(req.params.upid));
      const status = await pveRequest(
        session,
        "GET",
        `/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`,
      );
      res.json(status ?? {});
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/tasks/:node/:upid/log", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const upid = decodeURIComponent(param(req.params.upid));
      const log = await pveRequest(
        session,
        "GET",
        `/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/log`,
        { start: 0, limit: 500 },
      );
      res.json({ log: log || [] });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/storage/:node/:storage/content", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const storage = param(req.params.storage);
      const content = req.query.content as string | undefined;
      const rows = await pveRequest<ContentRow[]>(
        session,
        "GET",
        `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content`,
        content ? { content } : undefined,
      );
      res.json({ content: rows || [] });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/media/isos", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const items = await listMediaByContent(session, "iso");
      res.json({ items });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/media/templates", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const items = await listMediaByContent(session, "vztmpl");
      res.json({ items });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/media/backup-storages", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const storages = await listBackupStorages(session);
      res.json({ storages });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/media/storages", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const content = String(req.query.content || "iso");
      if (
        content !== "iso" &&
        content !== "vztmpl" &&
        content !== "images" &&
        content !== "rootdir"
      ) {
        res.status(400).json({ error: "content must be iso, vztmpl, images, or rootdir." });
        return;
      }
      const storages = await listMediaStorages(session, content);
      res.json({ storages });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/media/iso-usage", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const usage = await listIsoUsage(session);
      res.json({ usage });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.delete("/api/media", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = (req.body?.node ?? req.query.node) as string | undefined;
      const storage = (req.body?.storage ?? req.query.storage) as string | undefined;
      const volume = (req.body?.volume ?? req.query.volume) as string | undefined;
      if (!node || !storage || !volume) {
        res.status(400).json({ error: "node, storage, and volume are required." });
        return;
      }
      const { storage: volStorage, volname } = parseVolid(volume);
      const store = storage || volStorage;
      await pveRequest(
        session,
        "DELETE",
        `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(store)}/content/${encodeURIComponent(volname)}`,
      );
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post(
    "/api/media/upload",
    requireSession,
    mediaUpload.single("file"),
    async (req, res) => {
      const tmpPath = req.file?.path;
      try {
        const session = sessionOf(req);
        const node = String(req.body?.node || "");
        const storage = String(req.body?.storage || "");
        const content = String(req.body?.content || "iso");
        if (!node || !storage) {
          res.status(400).json({ error: "node and storage are required." });
          return;
        }
        if (content !== "iso" && content !== "vztmpl") {
          res.status(400).json({ error: "content must be iso or vztmpl." });
          return;
        }
        if (!req.file || !tmpPath) {
          res.status(400).json({ error: "file is required." });
          return;
        }
        const filename =
          String(req.body?.filename || "").trim() ||
          req.file.originalname ||
          "upload.bin";

        const form = new FormData();
        form.append("content", content);
        form.append("filename", filename);
        form.append("file", await openAsBlob(tmpPath), filename);

        const raw = await pveFormUpload(
          session,
          `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/upload`,
          form,
        );
        res.json({ ok: true, upid: unwrapUpid(raw) });
      } catch (err) {
        sendError(res, err);
      } finally {
        if (tmpPath) {
          try {
            await unlink(tmpPath);
          } catch {
            /* ignore */
          }
        }
      }
    },
  );

  app.post("/api/media/download-url", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const {
        node,
        storage,
        url,
        filename,
        content,
        checksum,
        checksumAlgorithm,
      } = (req.body || {}) as {
        node?: string;
        storage?: string;
        url?: string;
        filename?: string;
        content?: "iso" | "vztmpl";
        checksum?: string;
        checksumAlgorithm?: string;
      };
      if (!node || !storage || !url || !filename) {
        res.status(400).json({ error: "node, storage, url, and filename are required." });
        return;
      }
      const kind = content === "vztmpl" ? "vztmpl" : "iso";
      const raw = await pveRequest(
        session,
        "POST",
        `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/download-url`,
        {
          content: kind,
          filename,
          url,
          checksum: checksum || undefined,
          "checksum-algorithm": checksumAlgorithm || undefined,
        },
      );
      res.json({ ok: true, upid: unwrapUpid(raw) });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/media/appliances", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const nodes = await listNodes(session);
      if (nodes.length === 0) {
        res.status(400).json({ error: "No nodes available." });
        return;
      }
      const requested = typeof req.query.node === "string" ? req.query.node.trim() : "";
      const node = requested && nodes.includes(requested) ? requested : nodes[0];
      const rows =
        (await pveRequest<Record<string, unknown>[]>(
          session,
          "GET",
          `/nodes/${encodeURIComponent(node)}/aplinfo`,
        )) || [];

      const appliances = rows
        .map((row) => {
          const template = String(row.template || "").trim();
          if (!template) return null;
          return {
            template,
            package: row.package != null ? String(row.package) : undefined,
            type: row.type != null ? String(row.type) : undefined,
            version: row.version != null ? String(row.version) : undefined,
            section: row.section != null ? String(row.section) : undefined,
            description: row.description != null ? String(row.description) : undefined,
            os: row.os != null ? String(row.os) : undefined,
            headline: row.headline != null ? String(row.headline) : undefined,
            location: row.location != null ? String(row.location) : undefined,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a != null)
        .sort((a, b) => a.template.localeCompare(b.template));

      res.json({ appliances, node });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/media/appliances/download", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const { node, storage, template } = (req.body || {}) as {
        node?: string;
        storage?: string;
        template?: string;
      };
      if (!node || !storage || !template) {
        res.status(400).json({ error: "node, storage, and template are required." });
        return;
      }
      const raw = await pveRequest(
        session,
        "POST",
        `/nodes/${encodeURIComponent(node)}/aplinfo`,
        {
          storage,
          template,
        },
      );
      res.json({ ok: true, upid: unwrapUpid(raw) });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post(
    "/api/guests/:node/:type/:vmid/backup",
    requireSession,
    async (req, res) => {
      try {
        const session = sessionOf(req);
        const node = param(req.params.node);
        const type = param(req.params.type);
        const vmid = param(req.params.vmid);
        if (type !== "lxc" && type !== "qemu") {
          res.status(400).json({ error: "Invalid type." });
          return;
        }
        const { storage, mode, compress } = (req.body || {}) as {
          storage?: string;
          mode?: "snapshot" | "suspend" | "stop";
          compress?: "zstd" | "gzip" | "lzo" | "0";
        };
        if (!storage || !String(storage).trim()) {
          res.status(400).json({ error: "Storage is required." });
          return;
        }

        // Confirm the guest exists on this node (wrong node → vzdump returns OK and does nothing).
        try {
          await pveRequest(
            session,
            "GET",
            `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/status/current`,
          );
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Guest not found on this node.";
          console.error("[backup] guest check failed", { node, type, vmid, msg });
          res.status(404).json({
            error: `Guest ${vmid} was not found on node "${node}". ${msg}`,
          });
          return;
        }

        const payload = {
          vmid: String(vmid),
          storage: String(storage).trim(),
          mode: mode || "snapshot",
          compress: compress || "zstd",
          // Skip prune (needs Datastore.Allocate). Default remove=1 often blocks backups.
          remove: "0",
        };

        console.info("[backup] starting vzdump", { node, type, vmid, ...payload });

        let raw: unknown;
        try {
          raw = await pveRequest(
            session,
            "POST",
            `/nodes/${encodeURIComponent(node)}/vzdump`,
            payload,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "vzdump failed";
          console.error("[backup] vzdump rejected", { node, vmid, storage, msg });
          throw err;
        }

        console.info("[backup] vzdump response", { node, vmid, raw });

        // Proxmox returns the string "OK" when it silently skips (wrong node / empty guest list).
        if (raw === "OK" || raw === "ok") {
          res.status(409).json({
            error: `Proxmox did not start a backup for guest ${vmid} on node "${node}" (got OK with no task). Check that the guest lives on this node and no other vzdump lock is active.`,
            raw,
          });
          return;
        }

        let upid = unwrapUpid(raw);
        if (!upid) {
          await new Promise((r) => setTimeout(r, 1000));
          upid = await findRecentGuestTask(session, node, "vzdump", vmid);
        }

        if (!upid) {
          console.error("[backup] no UPID", { node, vmid, raw });
          res.status(502).json({
            error:
              "Proxmox did not return a backup task id. Need VM.Backup on the guest and Datastore.AllocateSpace on the storage.",
            raw: raw ?? null,
          });
          return;
        }

        res.json({ ok: true, upid });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Flat alias — easier to debug than nested guest paths.
  app.post("/api/backup", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const body = (req.body || {}) as {
        node?: string;
        type?: string;
        vmid?: string | number;
        storage?: string;
        mode?: "snapshot" | "suspend" | "stop";
        compress?: "zstd" | "gzip" | "lzo" | "0" | "none";
      };
      const node = String(body.node || "").trim();
      const type = String(body.type || "").trim();
      const vmid = String(body.vmid || "").trim();
      const storage = String(body.storage || "").trim();
      if (!node || !vmid || !storage) {
        res.status(400).json({ error: "node, vmid, and storage are required." });
        return;
      }
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "type must be lxc or qemu." });
        return;
      }

      try {
        await pveRequest(
          session,
          "GET",
          `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/status/current`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "not found";
        res.status(404).json({
          error: `Guest ${vmid} was not found on node "${node}". ${msg}`,
        });
        return;
      }

      const compress =
        body.compress === "none" || body.compress === "0" ? "0" : body.compress || "zstd";
      const payload = {
        vmid,
        storage,
        mode: body.mode || "snapshot",
        compress,
        remove: "0",
      };
      console.info("[backup] POST /api/backup", { node, type, ...payload });

      const raw = await pveRequest(
        session,
        "POST",
        `/nodes/${encodeURIComponent(node)}/vzdump`,
        payload,
      );
      console.info("[backup] /api/backup response", { raw });

      if (raw === "OK" || raw === "ok") {
        res.status(409).json({
          error: `Proxmox did not start a backup for guest ${vmid} on node "${node}" (got OK with no task).`,
          raw,
        });
        return;
      }

      let upid = unwrapUpid(raw);
      if (!upid) {
        await new Promise((r) => setTimeout(r, 1000));
        upid = await findRecentGuestTask(session, node, "vzdump", vmid);
      }
      if (!upid) {
        res.status(502).json({
          error: "Proxmox did not return a backup task id.",
          raw: raw ?? null,
        });
        return;
      }
      res.json({ ok: true, upid });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/backups/overview", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      type ResourceRow = {
        type?: string;
        node?: string;
        vmid?: number;
        name?: string;
        status?: string;
        template?: number;
      };

      const [resources, backups, schedules] = await Promise.all([
        pveRequest<ResourceRow[]>(session, "GET", "/cluster/resources"),
        listAllBackupItems(session),
        listSchedules(),
      ]);

      const byVmid = new Map<number, (ContentRow & { node: string; storage: string })[]>();
      for (const row of backups) {
        const vmid = row.vmid ?? vmidFromBackupVolid(row.volid);
        if (vmid == null) continue;
        const list = byVmid.get(vmid) || [];
        list.push({ ...row, vmid });
        byVmid.set(vmid, list);
      }

      const backupSchedulesByGuest = new Map<string, PowerSchedule[]>();
      for (const schedule of schedules) {
        if (schedule.action !== "backup") continue;
        const key = `${schedule.node}:${schedule.type}:${schedule.vmid}`;
        const list = backupSchedulesByGuest.get(key) || [];
        list.push(schedule);
        backupSchedulesByGuest.set(key, list);
      }

      const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      function scheduleSummary(list: PowerSchedule[]): string | null {
        if (!list.length) return null;
        const preferred =
          list.find((s) => s.enabled) ||
          [...list].sort((a, b) => a.time.localeCompare(b.time))[0];
        if (!preferred) return null;
        const days =
          preferred.days.length === 0
            ? "every day"
            : preferred.days.map((d) => dayLabels[d] ?? String(d)).join(", ");
        const paused = preferred.enabled ? "" : " (paused)";
        const extra =
          list.length > 1 ? ` · +${list.length - 1} more` : "";
        return `${preferred.time} ${days}${paused}${extra}`;
      }

      const guests = (resources || [])
        .filter(
          (r) =>
            (r.type === "lxc" || r.type === "qemu") &&
            !r.template &&
            r.node &&
            r.vmid != null,
        )
        .map((r) => {
          const vmid = Number(r.vmid);
          const type = r.type as "lxc" | "qemu";
          const node = r.node!;
          const list = [...(byVmid.get(vmid) || [])].sort(
            (a, b) => (b.ctime || 0) - (a.ctime || 0),
          );
          const last = list[0];
          const guestSchedules =
            backupSchedulesByGuest.get(`${node}:${type}:${vmid}`) || [];
          const enabledCount = guestSchedules.filter((s) => s.enabled).length;
          return {
            node,
            type,
            vmid,
            name: r.name || String(vmid),
            status: r.status,
            backupCount: list.length,
            lastBackup: last
              ? {
                  node: last.node,
                  storage: last.storage,
                  volid: last.volid,
                  size: last.size,
                  ctime: last.ctime,
                  format: last.format,
                  notes: last.notes,
                  vmid: last.vmid,
                }
              : null,
            hasBackupSchedule: guestSchedules.length > 0,
            backupScheduleCount: guestSchedules.length,
            enabledBackupScheduleCount: enabledCount,
            backupScheduleSummary: scheduleSummary(guestSchedules),
          };
        });

      res.json({ guests });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get(
    "/api/guests/:node/:type/:vmid/backups",
    requireSession,
    async (req, res) => {
      try {
        const session = sessionOf(req);
        const node = param(req.params.node);
        const type = param(req.params.type);
        const vmid = Number(param(req.params.vmid));
        if (type !== "lxc" && type !== "qemu") {
          res.status(400).json({ error: "Invalid type." });
          return;
        }
        if (!Number.isFinite(vmid)) {
          res.status(400).json({ error: "Invalid VMID." });
          return;
        }
        const backups = await listGuestBackups(session, node, vmid);
        res.json({ backups });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  app.post("/api/backups/restore", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const { node, type, vmid, archive, storage, force } = req.body as {
        node?: string;
        type?: "lxc" | "qemu";
        vmid?: number;
        archive?: string;
        storage?: string;
        force?: boolean;
      };
      if (!node || !type || vmid == null || !archive) {
        res.status(400).json({ error: "node, type, vmid, and archive are required." });
        return;
      }
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "Invalid type." });
        return;
      }

      let raw: unknown;
      if (type === "qemu") {
        raw = await pveRequest(session, "POST", `/nodes/${encodeURIComponent(node)}/qemu`, {
          vmid,
          archive,
          storage: storage || undefined,
          force: force ? 1 : undefined,
        });
      } else {
        raw = await pveRequest(session, "POST", `/nodes/${encodeURIComponent(node)}/lxc`, {
          vmid,
          ostemplate: archive,
          restore: 1,
          storage: storage || undefined,
          force: force ? 1 : undefined,
        });
      }

      res.json({ ok: true, upid: unwrapUpid(raw) });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.delete("/api/backups", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = (req.body?.node ?? req.query.node) as string | undefined;
      const storage = (req.body?.storage ?? req.query.storage) as string | undefined;
      const volume = (req.body?.volume ?? req.query.volume) as string | undefined;
      if (!node || !storage || !volume) {
        res.status(400).json({ error: "node, storage, and volume are required." });
        return;
      }
      const { storage: volStorage, volname } = parseVolid(volume);
      const store = storage || volStorage;
      await pveRequest(
        session,
        "DELETE",
        `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(store)}/content/${encodeURIComponent(volname)}`,
      );
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/guests/:node/qemu/:vmid/cdrom", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const vmid = param(req.params.vmid);
      const { volid, ide } = req.body as { volid?: string | null; ide?: string };

      const base = `/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(vmid)}`;
      const config = await pveRequest<Record<string, unknown>>(session, "GET", `${base}/config`);
      const drive = ide || findCdromDrive(config) || "ide2";
      const digest = config.digest as string | undefined;
      const driveValue =
        volid == null || volid === "" ? "none,media=cdrom" : `${volid},media=cdrom`;

      await pveRequest(session, "PUT", `${base}/config`, {
        [drive]: driveValue,
        digest: digest || undefined,
      });

      res.json({ ok: true, drive, value: driveValue });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/cluster/nextid", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const nextid = await pveRequest<string | number>(session, "GET", "/cluster/nextid");
      res.json({ nextid: Number(nextid) });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/nodes/:node/bridges", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      type NetRow = {
        iface?: string;
        type?: string;
        active?: number;
        comments?: string;
      };
      const rows =
        (await pveRequest<NetRow[]>(
          session,
          "GET",
          `/nodes/${encodeURIComponent(node)}/network`,
        )) || [];
      const bridges = rows
        .filter((r) => r.type === "bridge" && r.iface)
        .map((r) => ({
          iface: r.iface!,
          active: r.active !== 0,
          comments: r.comments,
        }))
        .sort((a, b) => a.iface.localeCompare(b.iface));
      res.json({ bridges });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/guests", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const body = (req.body || {}) as {
        type?: string;
        node?: string;
        vmid?: number | string;
        name?: string;
        cores?: number;
        memory?: number;
        swap?: number;
        diskGiB?: number;
        storage?: string;
        bridge?: string;
        ostemplate?: string;
        password?: string;
        unprivileged?: boolean;
        iso?: string | null;
        start?: boolean;
      };

      const type = body.type;
      const node = String(body.node || "").trim();
      const vmid = Number(body.vmid);
      const name = String(body.name || "").trim();
      const cores = Number(body.cores ?? 2);
      const memory = Number(body.memory ?? 2048);
      const diskGiB = Number(body.diskGiB ?? 8);
      const storage = String(body.storage || "").trim();
      const bridge = String(body.bridge || "vmbr0").trim() || "vmbr0";

      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "type must be lxc or qemu." });
        return;
      }
      if (!node) {
        res.status(400).json({ error: "node is required." });
        return;
      }
      if (!Number.isFinite(vmid) || vmid < 100 || vmid > 999_999_999) {
        res.status(400).json({ error: "vmid must be between 100 and 999999999." });
        return;
      }
      if (!name) {
        res.status(400).json({ error: "name is required." });
        return;
      }
      if (!storage) {
        res.status(400).json({ error: "storage is required." });
        return;
      }
      if (!Number.isFinite(cores) || cores < 1 || cores > 128) {
        res.status(400).json({ error: "cores must be between 1 and 128." });
        return;
      }
      if (!Number.isFinite(memory) || memory < 16 || memory > 524288) {
        res.status(400).json({ error: "memory must be between 16 and 524288 MiB." });
        return;
      }
      if (!Number.isFinite(diskGiB) || diskGiB < 1 || diskGiB > 1024) {
        res.status(400).json({ error: "disk must be between 1 and 1024 GiB." });
        return;
      }

      let raw: unknown;

      if (type === "lxc") {
        const ostemplate = String(body.ostemplate || "").trim();
        const password = String(body.password || "");
        if (!ostemplate) {
          res.status(400).json({ error: "ostemplate is required for containers." });
          return;
        }
        if (password.length < 5) {
          res.status(400).json({ error: "password must be at least 5 characters." });
          return;
        }
        const swap = Number(body.swap ?? 512);
        if (!Number.isFinite(swap) || swap < 0 || swap > 524288) {
          res.status(400).json({ error: "swap must be between 0 and 524288 MiB." });
          return;
        }

        raw = await pveRequest(session, "POST", `/nodes/${encodeURIComponent(node)}/lxc`, {
          vmid,
          hostname: name,
          ostemplate,
          password,
          rootfs: `${storage}:${diskGiB}`,
          cores,
          memory,
          swap,
          net0: `name=eth0,bridge=${bridge},ip=dhcp`,
          unprivileged: body.unprivileged === false ? 0 : 1,
          start: body.start ? 1 : undefined,
        });
      } else {
        const iso = body.iso ? String(body.iso).trim() : "";
        const params: Record<string, string | number | boolean | undefined> = {
          vmid,
          name,
          cores,
          memory,
          scsihw: "virtio-scsi-single",
          scsi0: `${storage}:${diskGiB}`,
          net0: `virtio,bridge=${bridge}`,
          ostype: "l26",
          cpu: "x86-64-v2-AES",
          agent: "1",
          start: body.start ? 1 : undefined,
        };
        if (iso) {
          params.ide2 = `${iso},media=cdrom`;
          params.boot = "order=ide2;scsi0";
        } else {
          params.boot = "order=scsi0";
        }
        raw = await pveRequest(
          session,
          "POST",
          `/nodes/${encodeURIComponent(node)}/qemu`,
          params,
        );
      }

      res.json({
        ok: true,
        upid: unwrapUpid(raw),
        type,
        node,
        vmid,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/guest-icons", requireSession, async (_req, res) => {
    try {
      const icons = await listGuestIcons();
      res.json({ icons });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/guest-icons/:node/:type/:vmid", requireSession, async (req, res) => {
    try {
      const node = param(req.params.node);
      const type = param(req.params.type);
      const vmid = param(req.params.vmid);
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "Invalid type." });
        return;
      }
      const body = (req.body || {}) as {
        mode?: GuestIconMode;
        slug?: string;
        file?: string;
      };
      const mode = body.mode;
      if (mode !== "auto" && mode !== "cdn" && mode !== "upload" && mode !== "none") {
        res.status(400).json({ error: "mode must be auto, cdn, upload, or none." });
        return;
      }
      if (mode === "cdn" && !String(body.slug || "").trim()) {
        res.status(400).json({ error: "slug is required for cdn mode." });
        return;
      }
      if (mode === "upload" && !String(body.file || "").trim()) {
        res.status(400).json({ error: "file is required for upload mode." });
        return;
      }
      const icon = await setGuestIcon(node, type, vmid, {
        mode,
        slug: body.slug ? String(body.slug).trim() : undefined,
        file: body.file ? path.basename(String(body.file)) : undefined,
      });
      res.json({ icon });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.delete("/api/guest-icons/:node/:type/:vmid", requireSession, async (req, res) => {
    try {
      const node = param(req.params.node);
      const type = param(req.params.type);
      const vmid = param(req.params.vmid);
      await deleteGuestIcon(node, type, vmid);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post(
    "/api/guest-icons/upload",
    requireSession,
    iconUpload.single("file"),
    async (req, res) => {
      try {
        if (!req.file?.buffer) {
          res.status(400).json({ error: "file is required." });
          return;
        }
        const filename = await saveGuestIconUpload(
          req.file.originalname || "icon.png",
          req.file.buffer,
        );
        res.json({ file: filename, url: `/api/guest-icons/file/${encodeURIComponent(filename)}` });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  app.get("/api/guest-icons/file/:filename", requireSession, async (req, res) => {
    try {
      const filename = path.basename(param(req.params.filename));
      const full = guestIconUploadPath(filename);
      if (!full) {
        res.status(400).json({ error: "Invalid filename." });
        return;
      }
      const stream = createReadStream(full);
      stream.on("error", () => {
        if (!res.headersSent) res.status(404).json({ error: "File not found." });
      });
      const ext = path.extname(filename).toLowerCase();
      const type =
        ext === ".svg"
          ? "image/svg+xml"
          : ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : "image/jpeg";
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "private, max-age=86400");
      stream.pipe(res);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/schedules", requireSession, async (_req, res) => {
    try {
      const schedules = await listSchedules();
      res.json({
        schedules,
        automationReady: isScheduleAutomationReady(),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/schedules", requireSession, async (req, res) => {
    try {
      const body = req.body as Partial<PowerSchedule>;
      if (!body.node || body.type == null || body.vmid == null || !body.action || !body.time) {
        res.status(400).json({
          error: "node, type, vmid, action, and time are required.",
        });
        return;
      }
      if (body.type !== "lxc" && body.type !== "qemu") {
        res.status(400).json({ error: "Invalid type." });
        return;
      }
      if (!isScheduleAction(body.action)) {
        res.status(400).json({ error: "Invalid action." });
        return;
      }
      const backupFields = normalizeBackupFields({
        action: body.action,
        storage: body.storage,
        backupMode: body.backupMode,
        compress: body.compress,
      });
      if ("error" in backupFields) {
        res.status(400).json({ error: backupFields.error });
        return;
      }
      const existing = (await listSchedules()).find((s) => s.id === body.id);
      const schedule: PowerSchedule = {
        id: body.id || crypto.randomUUID(),
        node: body.node,
        type: body.type,
        vmid: Number(body.vmid),
        name: body.name,
        enabled: body.enabled !== false,
        action: body.action,
        time: body.time,
        days: Array.isArray(body.days) ? body.days : [],
        ...backupFields,
        lastRunKey: body.lastRunKey ?? existing?.lastRunKey,
        lastRunAt: body.lastRunAt ?? existing?.lastRunAt,
      };
      await upsertSchedule(schedule);
      res.json({ schedule });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/marketplace", requireSession, async (req, res) => {
    try {
      const refresh = String(req.query.refresh || "") === "1";
      const catalog = await getHelperCatalog(refresh);
      res.json(catalog);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/marketplace/:slug", requireSession, async (req, res) => {
    try {
      const slug = param(req.params.slug).toLowerCase();
      if (!isSafeSlug(slug)) {
        res.status(400).json({ error: "Invalid script." });
        return;
      }
      const catalog = await getHelperCatalog();
      const script = findHelperScript(catalog, slug);
      if (!script) {
        res.status(404).json({ error: "Script not found." });
        return;
      }
      const alpine = String(req.query.alpine || "") === "1";
      res.json({
        script,
        command: commandForScript(script, alpine),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.delete("/api/schedules/:id", requireSession, async (req, res) => {
    try {
      const id = param(req.params.id);
      const removed = await deleteSchedule(id);
      if (!removed) {
        res.status(404).json({ error: "Schedule not found." });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });
}
