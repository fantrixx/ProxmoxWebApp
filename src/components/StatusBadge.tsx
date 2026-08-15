import { guestVisualStatus, statusLabel } from "../format";

type Tone = "good" | "warn" | "accent" | "muted";

function toneFor(status: string): Tone {
  const s = status.toLowerCase();
  if (s === "running" || s === "online") return "good";
  if (
    s === "shutting down" ||
    s === "stopping" ||
    s === "rebooting" ||
    s === "paused" ||
    s === "suspended"
  ) {
    return "warn";
  }
  if (s === "starting" || s === "creating" || s === "migrating") return "accent";
  return "muted";
}

const toneClass: Record<Tone, string> = {
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  accent: "bg-accent/15 text-accent",
  muted: "bg-white/10 text-muted",
};

const dotClass: Record<Tone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  accent: "bg-accent",
  muted: "bg-muted",
};

const pulseClass: Record<Tone, string> = {
  good: "bg-good/40 animate-status-pulse",
  warn: "bg-warn/40 animate-status-pulse-warn",
  accent: "bg-accent/40 animate-status-pulse-accent",
  muted: "bg-muted/40",
};

export function StatusBadge({
  status,
  qmpstatus,
  lock,
  pending,
}: {
  status?: string;
  qmpstatus?: string;
  lock?: string;
  pending?: string;
}) {
  const visual = guestVisualStatus({ status, qmpstatus, lock, pending });
  const tone = toneFor(visual);
  const pulsing = tone === "good" || tone === "warn" || tone === "accent";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}
    >
      {pulsing ? (
        <span className="relative flex size-2 items-center justify-center" aria-hidden>
          <span className={`absolute size-2 rounded-full ${pulseClass[tone]}`} />
          <span className={`relative size-1.5 rounded-full ${dotClass[tone]}`} />
        </span>
      ) : (
        <span className={`size-1.5 rounded-full ${dotClass[tone]}`} aria-hidden />
      )}
      {statusLabel(visual)}
    </span>
  );
}
