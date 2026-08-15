import { statusLabel } from "../format";

export function StatusBadge({ status }: { status?: string }) {
  const running = status === "running" || status === "online";
  const paused = status === "paused";
  const tone = running
    ? "bg-good/15 text-good"
    : paused
      ? "bg-warn/15 text-warn"
      : "bg-white/10 text-muted";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {running ? (
        <span className="relative flex size-2 items-center justify-center" aria-hidden>
          <span className="absolute size-2 rounded-full bg-good/40 animate-status-pulse" />
          <span className="relative size-1.5 rounded-full bg-good" />
        </span>
      ) : (
        <span
          className={`size-1.5 rounded-full ${paused ? "bg-warn" : "bg-muted"}`}
          aria-hidden
        />
      )}
      {statusLabel(status)}
    </span>
  );
}
