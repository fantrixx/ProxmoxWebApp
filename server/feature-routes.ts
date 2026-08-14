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
): Promise<ContentRow[]> {
  const backups: ContentRow[] = [];
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
        backups.push({ ...row, volid: row.volid });
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

export function registerFeatureRoutes(app: Express, helpers: RouteHelpers): void {
  const { requireSession, sessionOf, param, sendError } = helpers;

  app.get("/api/tasks", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const limit = Number(req.query.limit ?? 50);
      const tasks = await pveRequest(session, "GET", "/cluster/tasks", {
        limit: Number.isFinite(limit) ? limit : 50,
      });
      res.json({ tasks: tasks || [] });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/tasks/:node/:upid/status", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const upid = param(req.params.upid);
      const status = await pveRequest(
        session,
        "GET",
        `/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`,
      );
      res.json(status);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/tasks/:node/:upid/log", requireSession, async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const upid = param(req.params.upid);
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
            vmid: Number(vmid),
            storage,
            mode: mode || "snapshot",
            compress: compress || "zstd",
          },
        );
        res.json({ ok: true, upid: unwrapUpid(raw) });
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
