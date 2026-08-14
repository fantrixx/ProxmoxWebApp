import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { fetch as undiciFetch } from "undici";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GITHUB_REPO = process.env.GITHUB_REPO || "fantrixx/ProxmoxWebApp";
const REPO_BRANCH = process.env.REPO_BRANCH || "main";
const CACHE_OK_MS = 5 * 60 * 1000;
const CACHE_ERR_MS = 30 * 1000;

export type AppVersionInfo = {
  name: string;
  currentVersion: string;
  currentCommit: string | null;
  latestVersion: string | null;
  latestCommit: string | null;
  latestMessage: string | null;
  updateAvailable: boolean;
  updateCommand: string;
  repoUrl: string;
  checkedAt: number;
  error?: string;
};

let cache: AppVersionInfo | null = null;
let cacheUntil = 0;
let inflight: Promise<AppVersionInfo> | null = null;

function readPackageVersion(): string {
  try {
    const raw = readFileSync(path.join(ROOT, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Compare dotted versions: 1 if a>b, -1 if a<b, 0 if equal/unknown. */
function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

async function localGitCommit(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      timeout: 5000,
    });
    const sha = stdout.trim().toLowerCase();
    return /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

async function remoteGitCommit(): Promise<{ sha: string; message: string } | null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/commits/${encodeURIComponent(REPO_BRANCH)}`;
  const res = await undiciFetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ProxPanel-VersionCheck",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}`);
  }
  const body = (await res.json()) as {
    sha?: string;
    commit?: { message?: string };
  };
  if (!body.sha) return null;
  const message = (body.commit?.message || "").split("\n")[0]?.trim() || "";
  return { sha: body.sha.toLowerCase(), message };
}

async function remotePackageVersion(): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${encodeURIComponent(REPO_BRANCH)}/package.json`;
  const res = await undiciFetch(url, {
    headers: { "User-Agent": "ProxPanel-VersionCheck" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`GitHub raw ${res.status}`);
  }
  const body = (await res.json()) as { version?: string };
  return body.version || null;
}

function short(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

export async function getAppVersion(force = false): Promise<AppVersionInfo> {
  const now = Date.now();
  if (!force && cache && now < cacheUntil) {
    return cache;
  }
  if (!force && inflight) {
    return inflight;
  }

  const run = (async () => {
    const currentVersion = readPackageVersion();
    const currentCommit = await localGitCommit();
    let latestCommit: string | null = null;
    let latestMessage: string | null = null;
    let latestVersion: string | null = null;
    let error: string | undefined;
    let updateAvailable = false;

    const remoteErrors: string[] = [];

    try {
      const remote = await remoteGitCommit();
      if (remote) {
        latestCommit = remote.sha;
        latestMessage = remote.message || null;
        if (currentCommit && latestCommit && currentCommit !== latestCommit) {
          updateAvailable = true;
        }
      }
    } catch (err) {
      remoteErrors.push(err instanceof Error ? err.message : "commit check failed");
    }

    try {
      latestVersion = await remotePackageVersion();
      if (latestVersion && cmpVersion(latestVersion, currentVersion) > 0) {
        updateAvailable = true;
      }
    } catch (err) {
      remoteErrors.push(err instanceof Error ? err.message : "version check failed");
    }

    if (remoteErrors.length && !latestCommit && !latestVersion) {
      error = remoteErrors.join("; ");
    }

    const info: AppVersionInfo = {
      name: "ProxPanel",
      currentVersion,
      currentCommit: short(currentCommit),
      latestVersion,
      latestCommit: short(latestCommit),
      latestMessage,
      updateAvailable,
      updateCommand: "proxpanel-update",
      repoUrl: `https://github.com/${GITHUB_REPO}`,
      checkedAt: Date.now(),
      error,
    };

    cache = info;
    cacheUntil = Date.now() + (error && !updateAvailable ? CACHE_ERR_MS : CACHE_OK_MS);
    return info;
  })();

  inflight = run;
  try {
    return await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}
