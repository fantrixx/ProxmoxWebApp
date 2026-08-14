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
const CACHE_MS = 15 * 60 * 1000;

export type AppVersionInfo = {
  name: string;
  currentVersion: string;
  currentCommit: string | null;
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

async function localGitCommit(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      timeout: 5000,
    });
    const sha = stdout.trim();
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.toLowerCase() : null;
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
  const message = (body.commit?.message || "").split("\n")[0]?.trim() || null;
  return { sha: body.sha.toLowerCase(), message: message || "" };
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

  inflight = (async () => {
    const currentVersion = readPackageVersion();
    const currentCommit = await localGitCommit();
    let latestCommit: string | null = null;
    let latestMessage: string | null = null;
    let error: string | undefined;
    let updateAvailable = false;

    try {
      const remote = await remoteGitCommit();
      if (remote) {
        latestCommit = remote.sha;
        latestMessage = remote.message || null;
        if (currentCommit && latestCommit) {
          updateAvailable = currentCommit !== latestCommit;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Versionsprüfung fehlgeschlagen";
    }

    const info: AppVersionInfo = {
      name: "ProxPanel",
      currentVersion,
      currentCommit: short(currentCommit),
      latestCommit: short(latestCommit),
      latestMessage,
      updateAvailable,
      updateCommand: "proxpanel-update",
      repoUrl: `https://github.com/${GITHUB_REPO}`,
      checkedAt: Date.now(),
      error,
    };

    cache = info;
    cacheUntil = Date.now() + CACHE_MS;
    return info;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
