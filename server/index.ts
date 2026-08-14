import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCookie } from "cookie";
import { WebSocketServer } from "ws";
import { attachConsoleProxy } from "./console.ts";
import {
  loginWithPassword,
  normalizeHost,
  pveRequest,
  ProxmoxApiError,
  verifyToken,
  awaitOptionalTask,
} from "./proxmox.ts";
import {
  ipsFromLxcIfaces,
  ipsFromNetConfig,
  ipsFromQemuAgent,
  primaryDisk,
} from "./netinfo.ts";
import {
  COOKIE_NAME,
  createSession,
  deleteSession,
  getSession,
  type Session,
} from "./session.ts";
import { getAppVersion } from "./version.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || (isProd ? 3000 : 3001));

const app = express();
app.use(express.json());

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: false,
    maxAge: 8 * 60 * 60 * 1000,
  };
}

function readSid(req: express.Request): string | undefined {
  return parseCookie(req.headers.cookie || "")[COOKIE_NAME];
}

function requireSession(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const session = getSession(readSid(req));
  if (!session) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }
  (req as express.Request & { session: Session }).session = session;
  next();
}

function sessionOf(req: express.Request): Session {
  return (req as express.Request & { session: Session }).session;
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "ProxPanel" });
});

app.get("/api/version", async (req, res) => {
  try {
    const force = req.query.refresh === "1" || req.query.refresh === "true";
    const info = await getAppVersion(force);
    res.json(info);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Versionsprüfung fehlgeschlagen",
    });
  }
});

app.get("/api/auth/defaults", (_req, res) => {
  res.json({
    host: process.env.PROXMOX_URL || "",
    username: process.env.PROXMOX_USER || "",
    realm: process.env.PROXMOX_REALM || "pam",
    hasToken: Boolean(
      process.env.PROXMOX_TOKEN_ID && process.env.PROXMOX_TOKEN_SECRET,
    ),
  });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const {
      host,
      username,
      password,
      realm = "pam",
      rejectUnauthorized = false,
      useEnvToken = false,
    } = req.body as {
      host?: string;
      username?: string;
      password?: string;
      realm?: string;
      rejectUnauthorized?: boolean;
      useEnvToken?: boolean;
    };

    const insecureEnv = process.env.PROXMOX_INSECURE_TLS !== "false";
    const tlsReject = useEnvToken
      ? !insecureEnv
      : Boolean(rejectUnauthorized);

    if (useEnvToken) {
      const tokenId = process.env.PROXMOX_TOKEN_ID;
      const secret = process.env.PROXMOX_TOKEN_SECRET;
      const envHost = process.env.PROXMOX_URL;
      if (!tokenId || !secret || !envHost) {
        res.status(400).json({
          error:
            "API-Token ist nicht in der .env konfiguriert (PROXMOX_URL, PROXMOX_TOKEN_ID, PROXMOX_TOKEN_SECRET).",
        });
        return;
      }
      const normalized = normalizeHost(envHost);
      await verifyToken({
        host: normalized,
        tokenId,
        secret,
        rejectUnauthorized: tlsReject,
      });
      const session = createSession({
        host: normalized,
        username: tokenId,
        rejectUnauthorized: tlsReject,
        auth: { kind: "token", tokenId, secret },
      });
      res.cookie(COOKIE_NAME, session.id, cookieOptions());
      res.json({ username: tokenId, host: normalized });
      return;
    }

    if (!host || !username || !password) {
      res.status(400).json({ error: "Server, Benutzername und Passwort sind erforderlich." });
      return;
    }

    const normalized = normalizeHost(host);
    const login = await loginWithPassword({
      host: normalized,
      username,
      password,
      realm,
      rejectUnauthorized: tlsReject,
    });

    const session = createSession({
      host: normalized,
      username: login.username,
      rejectUnauthorized: tlsReject,
      auth: { kind: "ticket", ticket: login.ticket, csrf: login.csrf },
    });

    res.cookie(COOKIE_NAME, session.id, cookieOptions());
    res.json({ username: login.username, host: normalized });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const sid = readSid(req);
  const session = getSession(sid);
  if (session?.auth.kind === "ticket") {
    try {
      await pveRequest(session, "DELETE", "/access/ticket");
    } catch {
      /* ignore */
    }
  }
  deleteSession(sid);
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireSession, (req, res) => {
  const session = sessionOf(req);
  res.json({ username: session.username, host: session.host });
});

type ResourceRow = {
  id: string;
  type: string;
  node?: string;
  vmid?: number;
  status?: string;
  disk?: number;
  maxdisk?: number;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  swap?: number;
  maxswap?: number;
  ips?: string[];
  template?: number;
};

const ipCache = new Map<string, { ips: string[]; at: number }>();
const qemuAgentMissing = new Set<string>();

function netKey(node: string, type: string, vmid: number | string) {
  return `${node}/${type}/${vmid}`;
}

function forgetGuestNet(node: string, type: string, vmid: number | string) {
  const key = netKey(node, type, vmid);
  ipCache.delete(key);
  qemuAgentMissing.delete(key);
}

async function resolveGuestIps(
  session: Session,
  type: "lxc" | "qemu",
  node: string,
  vmid: number | string,
  running: boolean,
): Promise<string[]> {
  const key = netKey(node, type, vmid);
  const cached = ipCache.get(key);
  const ttl = cached?.ips.length ? 30_000 : running ? 12_000 : 60_000;
  if (cached && Date.now() - cached.at < ttl) return cached.ips;

  let ips: string[] = [];
  const base = `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(String(vmid))}`;

  if (running && type === "lxc") {
    try {
      ips = ipsFromLxcIfaces(await pveRequest(session, "GET", `${base}/interfaces`));
    } catch {
      /* Fallback auf Config */
    }
  } else if (running && type === "qemu" && !qemuAgentMissing.has(key)) {
    try {
      ips = ipsFromQemuAgent(
        await pveRequest(session, "GET", `${base}/agent/network-get-interfaces`),
      );
    } catch {
      qemuAgentMissing.add(key);
    }
  }

  if (!ips.length) {
    try {
      const config = await pveRequest<Record<string, unknown>>(session, "GET", `${base}/config`);
      ips = ipsFromNetConfig(config);
    } catch {
      ips = [];
    }
  }

  ipCache.set(key, { ips: ips.slice(0, 1), at: Date.now() });
  return ips.slice(0, 1);
}

app.get("/api/resources", requireSession, async (req, res) => {
  try {
    const session = sessionOf(req);
    const [resources, version, cluster] = await Promise.all([
      pveRequest<ResourceRow[]>(session, "GET", "/cluster/resources"),
      pveRequest<{ version: string; release: string }>(session, "GET", "/version").catch(
        () => null,
      ),
      pveRequest<unknown[]>(session, "GET", "/cluster/status").catch(() => []),
    ]);

    const guests = (resources || []).filter(
      (r) =>
        (r.type === "lxc" || r.type === "qemu") &&
        !r.template &&
        r.node &&
        r.vmid != null,
    );

    await Promise.all(
      guests.slice(0, 40).map(async (row) => {
        const type = row.type === "qemu" ? "qemu" : "lxc";
        const running = row.status === "running";
        try {
          if (running) {
            const current = await pveRequest<{
              disk?: number;
              maxdisk?: number;
              cpu?: number;
              mem?: number;
              maxmem?: number;
              swap?: number;
              maxswap?: number;
            }>(
              session,
              "GET",
              `/nodes/${encodeURIComponent(row.node!)}/${type}/${row.vmid}/status/current`,
            );
            if (current.disk != null) row.disk = current.disk;
            if (current.maxdisk != null) row.maxdisk = current.maxdisk;
            if (current.cpu != null) row.cpu = current.cpu;
            if (current.mem != null) row.mem = current.mem;
            if (current.maxmem != null) row.maxmem = current.maxmem;
          }
          row.ips = await resolveGuestIps(session, type, row.node!, row.vmid!, running);
        } catch {
          /* cluster/resources bleibt als Fallback */
        }
      }),
    );

    res.json({ resources, version, cluster });
  } catch (err) {
    sendError(res, err);
  }
});

app.get(
  "/api/guests/:node/:type/:vmid",
  requireSession,
  async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const type = param(req.params.type);
      const vmid = param(req.params.vmid);
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "Ungültiger Typ." });
        return;
      }
      const base = `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}`;
      const [status, config, rrd] = await Promise.all([
        pveRequest<{ status?: string }>(session, "GET", `${base}/status/current`),
        pveRequest<Record<string, unknown>>(session, "GET", `${base}/config`),
        pveRequest(session, "GET", `${base}/rrddata`, { timeframe: "hour" }).catch(
          () => [],
        ),
      ]);
      const ips = await resolveGuestIps(
        session,
        type,
        node,
        vmid,
        status?.status === "running",
      ).catch(() => ipsFromNetConfig(config));
      res.json({ status, config, rrd, ips });
    } catch (err) {
      sendError(res, err);
    }
  },
);

app.get(
  "/api/guests/:node/:type/:vmid/snapshots",
  requireSession,
  async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const type = param(req.params.type);
      const vmid = param(req.params.vmid);
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "Ungültiger Typ." });
        return;
      }
      const snapshots = await pveRequest(
        session,
        "GET",
        `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/snapshot`,
      );
      res.json({ snapshots: snapshots || [] });
    } catch (err) {
      sendError(res, err);
    }
  },
);

app.post(
  "/api/guests/:node/:type/:vmid/snapshots",
  requireSession,
  async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const type = param(req.params.type);
      const vmid = param(req.params.vmid);
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "Ungültiger Typ." });
        return;
      }
      const { snapname, description, vmstate } = req.body as {
        snapname?: string;
        description?: string;
        vmstate?: boolean;
      };
      if (!snapname || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(snapname)) {
        res.status(400).json({
          error: "Ungültiger Snapshot-Name. Nur Buchstaben, Zahlen, _ und -.",
        });
        return;
      }
      const raw = await pveRequest(
        session,
        "POST",
        `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/snapshot`,
        {
          snapname,
          description: description || undefined,
          vmstate: type === "qemu" && vmstate ? 1 : undefined,
        },
      );
      await awaitOptionalTask(session, node, raw);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  },
);

app.post(
  "/api/guests/:node/:type/:vmid/snapshots/:snapname/rollback",
  requireSession,
  async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const type = param(req.params.type);
      const vmid = param(req.params.vmid);
      const snapname = param(req.params.snapname);
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "Ungültiger Typ." });
        return;
      }
      const raw = await pveRequest(
        session,
        "POST",
        `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/snapshot/${encodeURIComponent(snapname)}/rollback`,
      );
      await awaitOptionalTask(session, node, raw);
      forgetGuestNet(node, type, vmid);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  },
);

app.delete(
  "/api/guests/:node/:type/:vmid/snapshots/:snapname",
  requireSession,
  async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const type = param(req.params.type);
      const vmid = param(req.params.vmid);
      const snapname = param(req.params.snapname);
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "Ungültiger Typ." });
        return;
      }
      const raw = await pveRequest(
        session,
        "DELETE",
        `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/snapshot/${encodeURIComponent(snapname)}`,
      );
      await awaitOptionalTask(session, node, raw);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  },
);

app.put(
  "/api/guests/:node/:type/:vmid/resources",
  requireSession,
  async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const type = param(req.params.type);
      const vmid = param(req.params.vmid);
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "Ungültiger Typ." });
        return;
      }

      const { cores, memory, swap, digest, growGiB } = req.body as {
        cores?: number;
        memory?: number;
        swap?: number;
        digest?: string;
        growGiB?: number;
      };

      const coresN = cores != null ? Number(cores) : undefined;
      const memoryN = memory != null ? Number(memory) : undefined;
      const swapN = swap != null ? Number(swap) : undefined;
      const growN = growGiB != null ? Number(growGiB) : 0;

      if (coresN != null && (!Number.isInteger(coresN) || coresN < 1 || coresN > 128)) {
        res.status(400).json({ error: "CPU-Kerne müssen zwischen 1 und 128 liegen." });
        return;
      }
      if (memoryN != null && (!Number.isFinite(memoryN) || memoryN < 16 || memoryN > 524288)) {
        res.status(400).json({ error: "RAM muss zwischen 16 und 524288 MiB liegen." });
        return;
      }
      if (
        type === "lxc" &&
        swapN != null &&
        (!Number.isFinite(swapN) || swapN < 0 || swapN > 524288)
      ) {
        res.status(400).json({ error: "Swap muss zwischen 0 und 524288 MiB liegen." });
        return;
      }
      if (growN && (growN < 0 || growN > 1024)) {
        res.status(400).json({ error: "Die Festplatte kann um maximal 1024 GiB wachsen." });
        return;
      }

      const base = `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}`;
      await pveRequest(session, "PUT", `${base}/config`, {
        cores: coresN,
        memory: memoryN,
        swap: type === "lxc" ? swapN : undefined,
        digest: digest || undefined,
      });

      if (growN > 0) {
        const config = await pveRequest<Record<string, unknown>>(
          session,
          "GET",
          `${base}/config`,
        );
        const disk = primaryDisk(type, config);
        if (!disk) {
          res.status(400).json({ error: "Keine Festplatte zum Vergrößern gefunden." });
          return;
        }
        const raw = await pveRequest(session, "PUT", `${base}/resize`, {
          disk,
          size: `+${growN}G`,
        });
        await awaitOptionalTask(session, node, raw);
      }

      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  },
);

app.post(
  "/api/guests/:node/:type/:vmid/status/:action",
  requireSession,
  async (req, res) => {
    try {
      const session = sessionOf(req);
      const node = param(req.params.node);
      const type = param(req.params.type);
      const vmid = param(req.params.vmid);
      const action = param(req.params.action);
      if (type !== "lxc" && type !== "qemu") {
        res.status(400).json({ error: "Ungültiger Typ." });
        return;
      }
      const allowed = new Set(["start", "stop", "shutdown", "reboot"]);
      if (!allowed.has(action)) {
        res.status(400).json({ error: "Ungültige Aktion." });
        return;
      }
      const raw = await pveRequest<string | { upid?: string }>(
        session,
        "POST",
        `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/status/${action}`,
      );
      await awaitOptionalTask(session, node, raw);
      forgetGuestNet(node, type, vmid);
      res.json({ ok: true, upid: typeof raw === "string" ? raw : undefined });
    } catch (err) {
      sendError(res, err);
    }
  },
);

function sendError(res: express.Response, err: unknown) {
  if (err instanceof ProxmoxApiError) {
    res.status(err.status >= 400 ? err.status : 500).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Unbekannter Fehler";
  const tlsHint =
    /certificate|SSL|self-signed|unable to verify/i.test(message)
      ? " Prüfen Sie, ob „Zertifikat prüfen“ deaktiviert ist (Self-Signed ist bei Proxmox üblich)."
      : "";
  res.status(500).json({ error: message + tlsHint });
}

if (isProd) {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
      next();
      return;
    }
    res.sendFile(path.join(dist, "index.html"));
  });
}

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
attachConsoleProxy(wss);

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/ws/console") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
    return;
  }
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(
    isProd
      ? `ProxPanel läuft auf http://localhost:${PORT}`
      : `ProxPanel API auf http://127.0.0.1:${PORT} (UI: Vite :5173)`,
  );
});
