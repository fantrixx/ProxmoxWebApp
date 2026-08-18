import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink } from "lucide-react";
import { dataApi } from "../api";
import { useApp } from "../context";
import { guestIconKey } from "../guestIconKey";
import type { GuestType } from "../types";
import { resolveGuestWebUi } from "../webUi";
import { useGuestIcons } from "./ServiceIcon";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to execCommand */
  }

  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.top = "0";
  el.style.left = "0";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  el.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(el);
  return ok;
}

export function IpList({
  ips,
  name,
  tags,
  guestType,
  node,
  type,
  vmid,
  iconSlug,
}: {
  ips?: string[];
  name?: string | null;
  tags?: string | null;
  guestType?: GuestType;
  node?: string;
  type?: string;
  vmid?: number | string;
  iconSlug?: string | null;
}) {
  const { toast } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const catalog = useQuery({
    queryKey: ["marketplace"],
    queryFn: () => dataApi.marketplace(),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(ips?.length),
  });
  const icons = useGuestIcons();
  const key =
    node && (type || guestType) && vmid != null
      ? guestIconKey(node, type || guestType || "lxc", vmid)
      : null;
  const stored = key ? icons.data?.icons?.[key] : null;
  const resolvedIconSlug =
    iconSlug || (stored?.mode === "cdn" ? stored.slug : undefined);

  if (!ips?.length) {
    return <span className="font-mono text-[11px] text-muted">no IP</span>;
  }

  const web = selected
    ? resolveGuestWebUi(selected, catalog.data?.scripts, {
        name,
        tags,
        guestType,
        iconSlug: resolvedIconSlug,
      })
    : null;

  async function copy(ip: string) {
    const ok = await copyText(ip);
    if (ok) toast("ok", `${ip} copied`);
    else toast("err", "Could not copy IP");
    setSelected(null);
  }

  function openUi() {
    if (!web) return;
    window.open(web.url, "_blank", "noopener,noreferrer");
    setSelected(null);
  }

  return (
    <>
      <span className="flex flex-wrap gap-1.5">
        {ips.map((ip) => (
          <button
            key={ip}
            type="button"
            title="Copy IP or open Web UI"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(ip);
            }}
            className="select-all rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] text-cyan hover:bg-surface-2"
          >
            {ip}
          </button>
        ))}
      </span>

      {selected ? (
        <IpActionDialog
          ip={selected}
          web={web}
          lookingUp={catalog.isLoading}
          onCopy={() => void copy(selected)}
          onOpen={openUi}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function IpActionDialog({
  ip,
  web,
  lookingUp,
  onCopy,
  onOpen,
  onClose,
}: {
  ip: string;
  web: ReturnType<typeof resolveGuestWebUi> | null;
  lookingUp: boolean;
  onCopy: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openLabel = web?.label ? `Open ${web.label}` : "Open in browser";
  const openHint = lookingUp
    ? "Looking up the Web UI port…"
    : web?.url || "";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ip-action-title"
        className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <h2 id="ip-action-title" className="text-lg font-semibold tracking-tight">
          {ip}
        </h2>
        <p className="mt-1 text-sm text-muted">Copy the address or open the Web UI.</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2"
          >
            <Copy className="size-3.5" />
            Copy IP
          </button>
          <button
            type="button"
            onClick={onOpen}
            disabled={lookingUp}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40"
          >
            <ExternalLink className="size-3.5" />
            {lookingUp ? "Looking up Web UI…" : openLabel}
          </button>
          {openHint ? (
            <p className="truncate text-center font-mono text-[11px] text-muted">
              {openHint}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink sm:min-h-0"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
