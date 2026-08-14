import { useEffect } from "react";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-40"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
              danger
                ? "bg-bad text-black hover:opacity-90"
                : "bg-accent text-black hover:bg-accent-2"
            }`}
          >
            {busy ? "Bitte warten…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
