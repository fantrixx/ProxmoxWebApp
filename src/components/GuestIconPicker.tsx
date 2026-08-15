import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ImagePlus, Search, Sparkles, Upload, X } from "lucide-react";
import {
  listServiceCatalog,
  resolveServiceIcon,
  serviceIconUrl,
  suggestServiceIcons,
} from "../serviceIcon";
import type { GuestIconMode, GuestIconRecord } from "../types";

export type IconDraft = {
  mode: GuestIconMode;
  slug?: string;
  file?: string;
  localFile?: File;
  localPreview?: string;
};

export function iconDraftFromRecord(record?: GuestIconRecord | null): IconDraft {
  if (!record) return { mode: "auto" };
  return {
    mode: record.mode,
    slug: record.slug,
    file: record.file,
  };
}

export function resolveIconSrc(
  draft: IconDraft,
  name?: string | null,
  tags?: string | null,
): { src: string | null; label: string; hint: string } {
  if (draft.mode === "none") {
    return { src: null, label: "No logo", hint: "Hidden on purpose" };
  }
  if (draft.mode === "upload") {
    if (draft.localPreview) {
      return { src: draft.localPreview, label: "Custom", hint: "Your upload" };
    }
    if (draft.file) {
      return {
        src: `/api/guest-icons/file/${encodeURIComponent(draft.file)}`,
        label: "Custom",
        hint: "Your upload",
      };
    }
    return { src: null, label: "Custom", hint: "Choose an image" };
  }
  if (draft.mode === "cdn" && draft.slug) {
    const label =
      listServiceCatalog().find((c) => c.slug === draft.slug)?.label || draft.slug;
    return { src: serviceIconUrl(draft.slug), label, hint: "From catalog" };
  }
  const match = resolveServiceIcon(name, tags);
  if (match) {
    return {
      src: serviceIconUrl(match.slug),
      label: match.label,
      hint: "Detected from name",
    };
  }
  return { src: null, label: "No logo", hint: "Nothing clear from the name yet" };
}

/** Persist draft: upload local file if needed, return API body. */
export async function persistIconDraft(
  draft: IconDraft,
  name: string,
  upload: (file: File) => Promise<{ file: string }>,
): Promise<{ mode: GuestIconMode; slug?: string; file?: string } | "clear" | null> {
  if (draft.mode === "auto") {
    const match = resolveServiceIcon(name);
    if (match) return { mode: "cdn", slug: match.slug };
    return "clear";
  }
  if (draft.mode === "none") return { mode: "none" };
  if (draft.mode === "cdn" && draft.slug) return { mode: "cdn", slug: draft.slug };
  if (draft.mode === "upload") {
    if (draft.localFile) {
      const res = await upload(draft.localFile);
      return { mode: "upload", file: res.file };
    }
    if (draft.file) return { mode: "upload", file: draft.file };
  }
  return null;
}

export function GuestIconPicker({
  open,
  name,
  tags,
  value,
  onChange,
  onClose,
  onPersist,
  title = "Guest logo",
  doneLabel = "Done",
}: {
  open: boolean;
  name?: string;
  tags?: string;
  value: IconDraft;
  onChange: (next: IconDraft) => void;
  onClose: () => void;
  /** If set, called when the user confirms (e.g. save to server). */
  onPersist?: (draft: IconDraft) => void | Promise<void>;
  title?: string;
  doneLabel?: string;
}) {
  const [tab, setTab] = useState<"choose" | "catalog">("choose");
  const [q, setQ] = useState("");
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wasOpen = useRef(false);

  const detected = useMemo(() => resolveServiceIcon(name, tags), [name, tags]);
  const suggestions = useMemo(
    () => suggestServiceIcons(name, tags, 8),
    [name, tags],
  );
  const listedSuggestions = useMemo(
    () =>
      suggestions
        .filter((s) => !detected || s.slug !== detected.slug)
        .slice(0, 6),
    [suggestions, detected],
  );
  const preview = resolveIconSrc(value, name, tags);
  const catalog = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return listServiceCatalog().filter((c) => {
      if (!needle) return true;
      return `${c.label} ${c.slug}`.toLowerCase().includes(needle);
    });
  }, [q]);

  // Reset UI only when the dialog opens — not when parent re-renders
  // (inline onClose / query updates used to kick us back to Auto mid-search).
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTab("choose");
      setQ("");
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  function revokeLocal(next: IconDraft) {
    if (value.localPreview && value.localPreview !== next.localPreview) {
      URL.revokeObjectURL(value.localPreview);
    }
  }

  function setAuto() {
    const next: IconDraft = { mode: "auto" };
    revokeLocal(next);
    onChange(next);
    setTab("choose");
  }

  function setNone() {
    const next: IconDraft = { mode: "none" };
    revokeLocal(next);
    onChange(next);
    setTab("choose");
  }

  function setSlug(slug: string) {
    const next: IconDraft = { mode: "cdn", slug };
    revokeLocal(next);
    onChange(next);
    setTab("choose");
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    const next: IconDraft = {
      mode: "upload",
      localFile: file,
      localPreview: previewUrl,
    };
    revokeLocal(next);
    onChange(next);
    setTab("choose");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <div className="flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-0.5 text-sm text-muted">
              Auto-detect from the name, pick a catalog icon, or upload your own.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "choose" ? (
            <div className="space-y-5">
              <div className="flex items-center gap-4 rounded-2xl border border-line bg-bg/60 p-4">
                <LogoPreview src={preview.src} className="size-16" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{preview.label}</p>
                  <p className="text-sm text-muted">{preview.hint}</p>
                  {detected && value.mode === "auto" ? (
                    <p className="mt-1 text-xs text-accent">Matched “{detected.label}”</p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ModeBtn
                  active={value.mode === "auto"}
                  onClick={setAuto}
                  icon={<Sparkles className="size-4" />}
                  label="Auto"
                />
                <ModeBtn
                  active={value.mode === "cdn"}
                  onClick={() => setTab("catalog")}
                  icon={<ImagePlus className="size-4" />}
                  label="Catalog"
                />
                <ModeBtn
                  active={value.mode === "upload"}
                  onClick={() => inputEl?.click()}
                  icon={<Upload className="size-4" />}
                  label="Upload"
                />
                <ModeBtn
                  active={value.mode === "none"}
                  onClick={setNone}
                  icon={<X className="size-4" />}
                  label="None"
                />
              </div>

              <input
                ref={setInputEl}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />

              {detected && value.mode === "auto" ? (
                <button
                  type="button"
                  onClick={() => setSlug(detected.slug)}
                  className="flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 text-left hover:bg-accent/15"
                >
                  <LogoPreview src={serviceIconUrl(detected.slug)} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      Use detected {detected.label}
                    </span>
                    <span className="block text-xs text-muted">
                      Lock this logo even if the name changes
                    </span>
                  </span>
                </button>
              ) : null}

              {listedSuggestions.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink">
                      {detected
                        ? "Other possibilities"
                        : "Suggestions for this name"}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setTab("catalog")}
                      className="text-xs text-accent hover:underline"
                    >
                      Browse all
                    </button>
                  </div>
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                    {listedSuggestions.map((s) => (
                      <li key={s.slug}>
                        <button
                          type="button"
                          onClick={() => setSlug(s.slug)}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 ${
                            value.mode === "cdn" && value.slug === s.slug
                              ? "bg-accent/10"
                              : ""
                          }`}
                        >
                          <LogoPreview
                            src={serviceIconUrl(s.slug)}
                            className="size-9"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {s.label}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {s.reason}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-accent">Use</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : !detected && name?.trim() ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-3 text-sm text-muted">
                  No close matches for “{name.trim()}”. Browse the catalog or
                  upload an icon.
                </p>
              ) : !detected && !name?.trim() ? (
                <p className="text-sm text-muted">
                  Enter a name first for suggestions, or open the catalog.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setTab("choose")}
                className="text-sm text-muted hover:text-ink"
              >
                ← Back
              </button>
              {!q.trim() && suggestions.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                    Suggested
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {suggestions.slice(0, 6).map((s) => (
                      <button
                        key={`sug-${s.slug}`}
                        type="button"
                        onClick={() => setSlug(s.slug)}
                        className="flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/5 p-2 hover:bg-accent/10"
                      >
                        <LogoPreview src={serviceIconUrl(s.slug)} className="size-9" />
                        <span className="line-clamp-2 text-center text-[10px] leading-tight text-muted">
                          {s.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search services…"
                  className="w-full rounded-xl border border-line bg-bg py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent"
                  autoFocus
                />
              </label>
              <div className="grid max-h-[min(22rem,45vh)] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {catalog.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setSlug(c.slug)}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-2.5 text-center hover:bg-surface-2 ${
                      value.slug === c.slug && value.mode === "cdn"
                        ? "border-accent bg-accent/10"
                        : "border-line"
                    }`}
                  >
                    <LogoPreview src={serviceIconUrl(c.slug)} className="size-10" />
                    <span className="line-clamp-2 text-[11px] leading-tight text-muted">
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-sm hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              void (async () => {
                if (onPersist) {
                  setSaving(true);
                  try {
                    await onPersist(value);
                  } finally {
                    setSaving(false);
                  }
                } else {
                  onClose();
                }
              })();
            }}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40"
          >
            {saving ? "Saving…" : doneLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function LogoPreview({
  src,
  className = "size-12",
}: {
  src: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg ring-1 ring-line ${className}`}
    >
      {src && !failed ? (
        <img
          key={src}
          src={src}
          alt=""
          className="size-[70%] object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImagePlus className="size-1/3 text-muted" aria-hidden />
      )}
    </span>
  );
}
