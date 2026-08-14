import type { Express, Request, Response, NextFunction } from "express";
import { pveRequest, unwrapUpid } from "./proxmox.ts";
import {
  deleteSchedule,
  listSchedules,
  upsertSchedule,
  type PowerSchedule,
} from "./schedules.ts";
import type { Session } from "./session.ts";

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

function findCdromDrive(config: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(config)) {
    if (!/^(ide|sata|scsi)\d+$/i.test(key)) continue;
    const str = String(value);
    if (str.includes("media=cdrom") || str.includes(".iso")) return key;
  }
  return null;
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
        const { storage, mode, compress } = req.body as {
          storage?: string;
          mode?: "snapshot" | "suspend" | "stop";
          compress?: "zstd" | "gzip" | "lzo" | "0";
        };
        if (!storage) {
          res.status(400).json({ error: "Storage is required." });
          return;
        }
        const raw = await pveRequest(
          session,
          "POST",
          `/nodes/${encodeURIComponent(node)}/vzdump`,
          {
            // Proxmox expects vmid as string (guest id list).
            vmid: String(vmid),
            storage,
            mode: mode || "snapshot",
            compress: compress || "zstd",
            // Default remove=1 requires Datastore.Allocate for prune — skip prune so
            // VM.Backup + Datastore.AllocateSpace is enough to start a backup.
            remove: 0,
          },
        );
        let upid = unwrapUpid(raw);
        if (!upid) {
          // Brief wait then resolve running vzdump task for this guest.
          await new Promise((r) => setTimeout(r, 800));
          upid = await findRecentGuestTask(session, node, "vzdump", vmid);
        }
        if (!upid && typeof raw === "string" && raw.startsWith("UPID:")) {
          upid = raw;
        }
        if (!upid) {
          res.status(502).json({
            error:
              "Proxmox did not return a backup task id. Need VM.Backup on the guest and Datastore.AllocateSpace on the storage.",
            raw: typeof raw === "string" ? raw : raw ?? null,
          });
          return;
        }
        res.json({ ok: true, upid });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

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

  app.get("/api/schedules", requireSession, async (_req, res) => {
    try {
      const schedules = await listSchedules();
      res.json({ schedules });
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
        lastRunKey: body.lastRunKey,
      };
      await upsertSchedule(schedule);
      res.json({ schedule });
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
