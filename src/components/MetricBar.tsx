export function MetricBar({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number;
  detail: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const tone =
    clamped >= 90 ? "bg-bad" : clamped >= 75 ? "bg-warn" : "bg-good";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-xs text-ink">{detail}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
