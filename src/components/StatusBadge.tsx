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
      <span
        className={`size-1.5 rounded-full ${running ? "bg-good" : paused ? "bg-warn" : "bg-muted"}`}
      />
      {statusLabel(status)}
    </span>
  );
}
