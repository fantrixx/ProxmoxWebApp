import { useApp } from "../context";

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-6 bottom-6 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className={`pointer-events-auto rounded-xl border px-4 py-3 text-left text-sm shadow-lg ${
            t.kind === "ok"
              ? "border-good/30 bg-surface text-good"
              : t.kind === "err"
                ? "border-bad/30 bg-surface text-bad"
                : "border-line bg-surface text-ink"
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
