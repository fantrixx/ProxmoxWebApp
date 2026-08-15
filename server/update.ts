import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  access,
  constants as fsConstants,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Keep update artifacts outside the git work tree — `proxpanel-update` runs `git clean`. */
const UPDATE_DIR = "/tmp/proxpanel-update";
const STATUS_PATH = path.join(UPDATE_DIR, "status.json");
const LOG_PATH = path.join(UPDATE_DIR, "update.log");
const WRAPPER_PATH = path.join(UPDATE_DIR, "run.sh");
const STALE_MS = 30 * 60 * 1000;

export type UpdateState =
  | "idle"
  | "starting"
  | "running"
  | "success"
  | "rolled_back"
  | "failed";

export type UpdateStatus = {
  state: UpdateState;
  startedAt: number | null;
  finishedAt: number | null;
  triggeredBy: string | null;
  previousCommit?: string | null;
  rolledBack?: boolean;
  error?: string;
  logPath: string;
  canUpdate: boolean;
};

function updateBinary(): string | null {
  // Prefer the installed CT helper. Falling back to the repo script is allowed
  // for installs that have not created the symlink yet.
  if (existsSync("/usr/local/bin/proxpanel-update")) {
    return "/usr/local/bin/proxpanel-update";
  }
  const script = path.join(ROOT, "ct/proxpanel.sh");
  if (existsSync(script) && existsSync("/etc/systemd/system/proxpanel.service")) {
    return script;
  }
  return null;
}

function canLaunchUpdate(): boolean {
  return updateBinary() != null;
}

const idleStatus = (): UpdateStatus => ({
  state: "idle",
  startedAt: null,
  finishedAt: null,
  triggeredBy: null,
  logPath: LOG_PATH,
  canUpdate: canLaunchUpdate(),
});

async function readStatusFile(): Promise<UpdateStatus | null> {
  try {
    const raw = await readFile(STATUS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<UpdateStatus>;
    if (!parsed || typeof parsed.state !== "string") return null;
    return {
      state: parsed.state as UpdateState,
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
      finishedAt: typeof parsed.finishedAt === "number" ? parsed.finishedAt : null,
      triggeredBy: typeof parsed.triggeredBy === "string" ? parsed.triggeredBy : null,
      previousCommit:
        typeof parsed.previousCommit === "string" ? parsed.previousCommit : null,
      rolledBack: Boolean(parsed.rolledBack) || parsed.state === "rolled_back",
      error: typeof parsed.error === "string" ? parsed.error : undefined,
      logPath: typeof parsed.logPath === "string" ? parsed.logPath : LOG_PATH,
      canUpdate: canLaunchUpdate(),
    };
  } catch {
    return null;
  }
}

async function writeStatus(
  status: Omit<UpdateStatus, "canUpdate" | "logPath"> & { logPath?: string },
): Promise<UpdateStatus> {
  const full: UpdateStatus = {
    state: status.state,
    startedAt: status.startedAt,
    finishedAt: status.finishedAt,
    triggeredBy: status.triggeredBy,
    previousCommit: status.previousCommit ?? null,
    rolledBack: Boolean(status.rolledBack) || status.state === "rolled_back",
    error: status.error,
    logPath: status.logPath ?? LOG_PATH,
    canUpdate: canLaunchUpdate(),
  };
  await mkdir(UPDATE_DIR, { recursive: true });
  await writeFile(STATUS_PATH, `${JSON.stringify(full)}\n`, "utf8");
  return full;
}

function isActive(status: UpdateStatus): boolean {
  if (status.state !== "starting" && status.state !== "running") return false;
  if (!status.startedAt) return true;
  return Date.now() - status.startedAt < STALE_MS;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function writeWrapper(opts: {
  startedAt: number;
  triggeredBy: string;
  updateCmd: string;
}): Promise<void> {
  const { startedAt, triggeredBy, updateCmd } = opts;
  const statusRunning = JSON.stringify({
    state: "running",
    startedAt,
    finishedAt: null,
    triggeredBy,
    logPath: LOG_PATH,
  });
  const content = `#!/usr/bin/env bash
set -uo pipefail
STATUS=${shellQuote(STATUS_PATH)}
LOG=${shellQuote(LOG_PATH)}
STARTED_AT=${startedAt}
WHO=${shellQuote(triggeredBy)}

sleep 1
printf '%s\\n' ${shellQuote(statusRunning)} > "$STATUS"

set +e
${updateCmd} >"$LOG" 2>&1
code=$?
set -e

now="$(date +%s%3N 2>/dev/null || node -e 'process.stdout.write(String(Date.now()))')"

# Prefer the terminal status written by proxpanel.sh (includes rollback details).
if node -e "const fs=require('fs');try{const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.exit(['success','failed','rolled_back'].includes(s.state)?0:1)}catch{process.exit(1)}" "$STATUS"; then
  exit "$code"
fi

if [[ "$code" -eq 0 ]]; then
  node -e "const fs=require('fs');fs.writeFileSync(process.argv[1], JSON.stringify({state:'success',startedAt:Number(process.argv[2]),finishedAt:Number(process.argv[3]),triggeredBy:process.argv[4],logPath:process.argv[5]})+'\\n')" \\
    "$STATUS" "$STARTED_AT" "$now" "$WHO" "$LOG"
elif [[ "$code" -eq 2 ]]; then
  node -e "const fs=require('fs');fs.writeFileSync(process.argv[1], JSON.stringify({state:'rolled_back',startedAt:Number(process.argv[2]),finishedAt:Number(process.argv[3]),triggeredBy:process.argv[4],rolledBack:true,error:process.argv[5],logPath:process.argv[6]})+'\\n')" \\
    "$STATUS" "$STARTED_AT" "$now" "$WHO" "Update failed; restored the previous working version." "$LOG"
  exit 2
else
  node -e "const fs=require('fs');fs.writeFileSync(process.argv[1], JSON.stringify({state:'failed',startedAt:Number(process.argv[2]),finishedAt:Number(process.argv[3]),triggeredBy:process.argv[4],error:process.argv[5],logPath:process.argv[6]})+'\\n')" \\
    "$STATUS" "$STARTED_AT" "$now" "$WHO" "Update exited with code $code. See $LOG" "$LOG"
  exit "$code"
fi
`;
  await writeFile(WRAPPER_PATH, content, { mode: 0o755 });
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const current = await readStatusFile();
  if (!current) return idleStatus();
  if ((current.state === "starting" || current.state === "running") && !isActive(current)) {
    return writeStatus({
      ...current,
      state: "failed",
      finishedAt: Date.now(),
      error: "Update timed out or was interrupted.",
    });
  }
  return { ...current, canUpdate: canLaunchUpdate() };
}

export async function startAppUpdate(triggeredBy: string): Promise<UpdateStatus> {
  const binary = updateBinary();
  if (!binary) {
    const failed = await writeStatus({
      state: "failed",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      triggeredBy,
      error:
        "No update command found. Install ProxPanel with the helper script or run proxpanel-update in the container.",
    });
    const err = new Error(failed.error || "Update unavailable");
    (err as Error & { status: number }).status = 503;
    throw err;
  }

  const current = await getUpdateStatus();
  if (isActive(current)) {
    const err = new Error("An update is already in progress.");
    (err as Error & { status: number }).status = 409;
    throw err;
  }

  const startedAt = Date.now();
  const updateCmd =
    binary === "/usr/local/bin/proxpanel-update"
      ? shellQuote(binary)
      : `bash ${shellQuote(binary)} --update`;

  await mkdir(UPDATE_DIR, { recursive: true });
  await writeWrapper({ startedAt, triggeredBy, updateCmd });
  await writeStatus({
    state: "starting",
    startedAt,
    finishedAt: null,
    triggeredBy,
  });

  const useSystemd =
    existsSync("/usr/bin/systemd-run") || existsSync("/bin/systemd-run");

  const child = useSystemd
    ? spawn("systemd-run", ["--collect", "--quiet", WRAPPER_PATH], {
        cwd: ROOT,
        detached: true,
        stdio: "ignore",
      })
    : spawn("/bin/bash", [WRAPPER_PATH], {
        cwd: ROOT,
        detached: true,
        stdio: "ignore",
      });

  child.on("error", (err) => {
    void writeStatus({
      state: "failed",
      startedAt,
      finishedAt: Date.now(),
      triggeredBy,
      error: err.message || "Failed to start update process.",
    });
  });

  child.unref();

  return writeStatus({
    state: "running",
    startedAt,
    finishedAt: null,
    triggeredBy,
  });
}

export async function updateLogTail(limit = 80): Promise<string> {
  try {
    await access(LOG_PATH, fsConstants.R_OK);
    const raw = await readFile(LOG_PATH, "utf8");
    const lines = raw.split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - limit)).join("\n");
  } catch {
    return "";
  }
}
