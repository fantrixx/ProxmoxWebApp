import type { Request } from "express";

/** Failed attempts in this window before a lockout. */
const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;
/** Hard lock after too many failures. */
const LOCKOUT_MS = 15 * 60 * 1000;
/** Cap total login POSTs per IP (success or fail) to slow sprays. */
const MAX_REQUESTS_PER_WINDOW = 30;

type Bucket = {
  windowStart: number;
  requests: number;
  failures: number;
  lockedUntil: number;
};

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  for (const [ip, b] of buckets) {
    if (b.lockedUntil < now && now - b.windowStart > WINDOW_MS) {
      buckets.delete(ip);
    }
  }
}

export function clientIp(req: Request): string {
  const raw = req.socket.remoteAddress || "unknown";
  // Normalize IPv4-mapped IPv6
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function getBucket(ip: string, now: number): Bucket {
  let b = buckets.get(ip);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { windowStart: now, requests: 0, failures: 0, lockedUntil: 0 };
    buckets.set(ip, b);
  }
  return b;
}

/** Call before handling login. Returns retry-after seconds when blocked. */
export function assertLoginAllowed(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  if (buckets.size > 5_000) prune(now);

  const b = getBucket(ip, now);
  if (b.lockedUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }

  b.requests += 1;
  if (b.requests > MAX_REQUESTS_PER_WINDOW) {
    b.lockedUntil = now + LOCKOUT_MS;
    return { ok: false, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000) };
  }

  return { ok: true };
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const b = getBucket(ip, now);
  b.failures += 1;
  if (b.failures >= MAX_FAILURES) {
    b.lockedUntil = now + LOCKOUT_MS;
  }
}

export function clearLoginFailures(ip: string): void {
  buckets.delete(ip);
}
