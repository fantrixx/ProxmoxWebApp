import { Agent, fetch as undiciFetch } from "undici";
import type { Session } from "./session.ts";

export type ProxmoxErrorBody = {
  data?: unknown;
  errors?: Record<string, string>;
  message?: string;
};

export class ProxmoxApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ProxmoxApiError";
  }
}

function dispatcher(rejectUnauthorized: boolean) {
  return new Agent({
    connect: { rejectUnauthorized },
  });
}

export function normalizeHost(input: string): string {
  let host = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(host)) {
    host = `https://${host}`;
  }
  const url = new URL(host);
  if (!url.port) url.port = "8006";
  return url.origin;
}

export async function loginWithPassword(opts: {
  host: string;
  username: string;
  password: string;
  realm: string;
  rejectUnauthorized: boolean;
}): Promise<{ ticket: string; csrf: string; username: string }> {
  const host = normalizeHost(opts.host);
  const user = opts.username.includes("@")
    ? opts.username
    : `${opts.username}@${opts.realm || "pam"}`;

  const body = new URLSearchParams({
    username: user,
    password: opts.password,
  });

  const res = await undiciFetch(`${host}/api2/json/access/ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    dispatcher: dispatcher(opts.rejectUnauthorized),
  });

  const json = (await res.json()) as {
    data?: { ticket?: string; CSRFPreventionToken?: string; username?: string };
    message?: string;
  };

  if (!res.ok || !json.data?.ticket || !json.data.CSRFPreventionToken) {
    throw new ProxmoxApiError(
      res.status,
      json.message || "Anmeldung am Proxmox-Server fehlgeschlagen.",
      json,
    );
  }

  return {
    ticket: json.data.ticket,
    csrf: json.data.CSRFPreventionToken,
    username: json.data.username || user,
  };
}

export async function verifyToken(opts: {
  host: string;
  tokenId: string;
  secret: string;
  rejectUnauthorized: boolean;
}): Promise<void> {
  const host = normalizeHost(opts.host);
  const res = await undiciFetch(`${host}/api2/json/version`, {
    headers: {
      Authorization: `PVEAPIToken=${opts.tokenId}=${opts.secret}`,
    },
    dispatcher: dispatcher(opts.rejectUnauthorized),
  });
  if (!res.ok) {
    throw new ProxmoxApiError(
      res.status,
      "API-Token ungültig oder keine Berechtigung.",
    );
  }
}

function authHeaders(session: Session, method: string): Record<string, string> {
  if (session.auth.kind === "token") {
    return {
      Authorization: `PVEAPIToken=${session.auth.tokenId}=${session.auth.secret}`,
    };
  }
  const headers: Record<string, string> = {
    Cookie: `PVEAuthCookie=${session.auth.ticket}`,
  };
  if (method !== "GET" && method !== "HEAD") {
    headers.CSRFPreventionToken = session.auth.csrf;
  }
  return headers;
}

export async function pveRequest<T = unknown>(
  session: Session,
  method: string,
  apiPath: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const url = new URL(`${session.host}/api2/json${apiPath}`);
  let body: string | undefined;

  if (params) {
    const filtered = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null,
    );
    if (method === "GET") {
      for (const [k, v] of filtered) url.searchParams.set(k, String(v));
    } else {
      const form = new URLSearchParams();
      for (const [k, v] of filtered) form.set(k, String(v));
      body = form.toString();
    }
  }

  const res = await undiciFetch(url, {
    method,
    headers: {
      ...authHeaders(session, method),
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
    dispatcher: dispatcher(session.rejectUnauthorized),
  });

  const json = (await res.json()) as { data?: T; errors?: unknown; message?: string };

  if (!res.ok) {
    const extra =
      json.errors && typeof json.errors === "object"
        ? Object.values(json.errors as Record<string, string>).join(" ")
        : "";
    throw new ProxmoxApiError(
      res.status,
      json.message || extra || `Proxmox-Fehler (${res.status})`,
      json,
    );
  }

  return json.data as T;
}

export async function waitForTask(
  session: Session,
  node: string,
  upid: string,
  timeoutMs = 60_000,
): Promise<{ status: string; exitstatus?: string }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = await pveRequest<{ status: string; exitstatus?: string }>(
      session,
      "GET",
      `/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`,
    );
    if (data.status !== "running") return data;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new ProxmoxApiError(504, "Zeitüberschreitung beim Warten auf die Aufgabe.");
}

export function unwrapUpid(raw: unknown): string | null {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (raw && typeof raw === "object" && "upid" in raw) {
    const upid = (raw as { upid?: string }).upid;
    return upid || null;
  }
  return null;
}

export async function awaitOptionalTask(
  session: Session,
  node: string,
  raw: unknown,
  timeoutMs = 120_000,
): Promise<{ status: string; exitstatus?: string } | null> {
  const upid = unwrapUpid(raw);
  if (!upid) return null;
  const task = await waitForTask(session, node, upid, timeoutMs);
  if (task.exitstatus && task.exitstatus !== "OK") {
    throw new ProxmoxApiError(500, `Aufgabe fehlgeschlagen: ${task.exitstatus}`);
  }
  return task;
}
