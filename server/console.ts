import type { IncomingMessage } from "node:http";
import https from "node:https";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME, getSession, type Session } from "./session.ts";
import { pveRequest, ProxmoxApiError } from "./proxmox.ts";

type TermProxy = {
  port: number;
  ticket: string;
  user: string;
  upid?: string;
};

function getSessionFromUpgrade(req: IncomingMessage): Session | undefined {
  const cookies = parseCookie(req.headers.cookie || "");
  return getSession(cookies[COOKIE_NAME]);
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

export function attachConsoleProxy(wss: WebSocketServer) {
  wss.on("connection", async (client, req) => {
    const session = getSessionFromUpgrade(req);
    if (!session) {
      client.close(4001, "Not signed in");
      return;
    }

    const url = new URL(req.url || "/", "http://localhost");
    const type = url.searchParams.get("type");
    const node = url.searchParams.get("node");
    const vmid = url.searchParams.get("vmid");
    const isNodeShell = type === "node";

    if (
      !node ||
      (!isNodeShell && ((type !== "lxc" && type !== "qemu") || !vmid))
    ) {
      client.close(4002, "Invalid console parameters");
      return;
    }

    let pveWs: WebSocket | null = null;
    let closed = false;
    let ready = false;
    const pending: RawData[] = [];
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const shutdown = (code = 1000, reason = "Console closed") => {
      if (closed) return;
      closed = true;
      if (pingTimer) clearInterval(pingTimer);
      try {
        client.close(code, reason);
      } catch {
        /* ignore */
      }
      try {
        pveWs?.close();
      } catch {
        /* ignore */
      }
    };

    const flushPending = () => {
      if (!pveWs || pveWs.readyState !== WebSocket.OPEN) return;
      for (const msg of pending) {
        pveWs.send(msg);
      }
      pending.length = 0;
    };

    client.on("close", () => shutdown());
    client.on("error", () => shutdown(1011, "Client error"));

    // Queue early client traffic (resize/input) until Proxmox answers OK.
    client.on("message", (data) => {
      if (!pveWs || pveWs.readyState !== WebSocket.OPEN || !ready) {
        pending.push(data);
        return;
      }
      pveWs.send(data);
    });

    try {
      const termPath = isNodeShell
        ? `/nodes/${encodeURIComponent(node)}/termproxy`
        : `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid!)}/termproxy`;
      const proxy = await pveRequest<TermProxy>(session, "POST", termPath);

      const hostUrl = new URL(session.host);
      const wsUrl = isNodeShell
        ? `wss://${hostUrl.host}/api2/json/nodes/${encodeURIComponent(node)}/vncwebsocket` +
          `?port=${proxy.port}&vncticket=${encodeURIComponent(proxy.ticket)}`
        : `wss://${hostUrl.host}/api2/json/nodes/${encodeURIComponent(node)}/` +
          `${type}/${encodeURIComponent(vmid!)}/vncwebsocket` +
          `?port=${proxy.port}&vncticket=${encodeURIComponent(proxy.ticket)}`;

      const headers: Record<string, string> = {};
      if (session.auth.kind === "ticket") {
        headers.Cookie = `PVEAuthCookie=${session.auth.ticket}`;
      } else {
        headers.Authorization = `PVEAPIToken=${session.auth.tokenId}=${session.auth.secret}`;
      }

      // Official pve-xtermjs uses the "binary" subprotocol.
      pveWs = new WebSocket(wsUrl, "binary", {
        rejectUnauthorized: session.rejectUnauthorized,
        headers,
        agent: new https.Agent({
          rejectUnauthorized: session.rejectUnauthorized,
        }),
      });

      pveWs.on("open", () => {
        pveWs?.send(`${proxy.user}:${proxy.ticket}\n`);
        pingTimer = setInterval(() => {
          if (pveWs?.readyState === WebSocket.OPEN) pveWs.ping();
          if (client.readyState === WebSocket.OPEN) client.ping();
        }, 30_000);
      });

      pveWs.on("message", (data) => {
        if (client.readyState !== WebSocket.OPEN) return;

        if (!ready) {
          const buf = toBuffer(data);
          if (buf.length >= 2 && buf[0] === 0x4f && buf[1] === 0x4b) {
            // First reply is ASCII "OK" — strip it, then start the real session.
            ready = true;
            const rest = buf.subarray(2);
            if (rest.length > 0) client.send(rest);
            flushPending();
            return;
          }
          // Unexpected greeting — still forward so the user sees an error hint.
          ready = true;
          client.send(data);
          flushPending();
          return;
        }

        client.send(data);
      });

      pveWs.on("close", () => shutdown(1000, "Proxmox console closed"));
      pveWs.on("error", (err) => {
        shutdown(1011, err.message.slice(0, 120));
      });
    } catch (err) {
      let message =
        err instanceof ProxmoxApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not open console";
      if (
        isNodeShell &&
        (session.auth.kind === "token" ||
          /token|does not look like a valid user/i.test(message))
      ) {
        message =
          "Node shell needs a Proxmox password login (root@pam). API tokens cannot open the host shell.";
      }
      shutdown(1011, message.slice(0, 160));
    }
  });
}
