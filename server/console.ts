import type { IncomingMessage } from "node:http";
import https from "node:https";
import { WebSocketServer, WebSocket } from "ws";
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

    if ((type !== "lxc" && type !== "qemu") || !node || !vmid) {
      client.close(4002, "Invalid console parameters");
      return;
    }

    let pveWs: WebSocket | null = null;
    let closed = false;
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

    client.on("close", () => shutdown());
    client.on("error", () => shutdown(1011, "Client error"));

    try {
      const proxy = await pveRequest<TermProxy>(
        session,
        "POST",
        `/nodes/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/termproxy`,
      );

      const hostUrl = new URL(session.host);
      const wsUrl =
        `wss://${hostUrl.host}/api2/json/nodes/${encodeURIComponent(node)}/` +
        `${type}/${encodeURIComponent(vmid)}/vncwebsocket` +
        `?port=${proxy.port}&vncticket=${encodeURIComponent(proxy.ticket)}`;

      const headers: Record<string, string> = {};
      if (session.auth.kind === "ticket") {
        headers.Cookie = `PVEAuthCookie=${session.auth.ticket}`;
      } else {
        headers.Authorization = `PVEAPIToken=${session.auth.tokenId}=${session.auth.secret}`;
      }

      pveWs = new WebSocket(wsUrl, {
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
        if (client.readyState === WebSocket.OPEN) client.send(data);
      });

      pveWs.on("close", () => shutdown(1000, "Proxmox console closed"));
      pveWs.on("error", (err) => {
        shutdown(1011, err.message.slice(0, 120));
      });

      client.on("message", (data) => {
        if (pveWs && pveWs.readyState === WebSocket.OPEN) {
          pveWs.send(data);
        }
      });
    } catch (err) {
      const message =
        err instanceof ProxmoxApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not open console";
      shutdown(1011, message.slice(0, 120));
    }
  });
}
