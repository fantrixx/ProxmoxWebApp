export function Sparkline({
  values,
  color = "#ff7a1a",
}: {
  values: number[];
  color?: string;
}) {
  const w = 240;
  const h = 56;
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) {
    return <div className="h-14 text-xs text-muted">Keine Verlaufsdaten</div>;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums
    .map((v, i) => {
      const x = (i / (nums.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}
