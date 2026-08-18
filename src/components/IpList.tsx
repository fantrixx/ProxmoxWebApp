import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [menu, setMenu] = useState<{ ip: string; anchor: HTMLElement } | null>(null);
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

  const web = menu
    ? resolveGuestWebUi(menu.ip, catalog.data?.scripts, {
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
    setMenu(null);
  }

  function openUi() {
    if (!web) return;
    window.open(web.url, "_blank", "noopener,noreferrer");
    setMenu(null);
  }

  return (
    <>
      <span className="flex flex-wrap gap-1.5">
        {ips.map((ip) => (
          <button
            key={ip}
            type="button"
            title="Copy IP or open Web UI"
            aria-haspopup="menu"
            aria-expanded={menu?.ip === ip}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const target = e.currentTarget;
              setMenu((cur) =>
                cur?.ip === ip ? null : { ip, anchor: target },
              );
            }}
            className={`select-all rounded-md px-1.5 py-0.5 font-mono text-[11px] text-cyan hover:bg-surface-2 ${
              menu?.ip === ip ? "bg-surface-2" : "bg-bg"
            }`}
          >
            {ip}
          </button>
        ))}
      </span>

      {menu ? (
        <IpPopupMenu
          anchor={menu.anchor}
          lookingUp={catalog.isLoading}
          openLabel={web?.label ? `Open ${web.label}` : "Open in browser"}
          openUrl={web?.url || ""}
          onCopy={() => void copy(menu.ip)}
          onOpen={openUi}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

function IpPopupMenu({
  anchor,
  lookingUp,
  openLabel,
  openUrl,
  onCopy,
  onOpen,
  onClose,
}: {
  anchor: HTMLElement;
  lookingUp: boolean;
  openLabel: string;
  openUrl: string;
  onCopy: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => {
    const r = anchor.getBoundingClientRect();
    return { top: r.bottom + 4, left: r.left };
  });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom;
    const openAbove = spaceBelow < h + 8 && r.top > h + 8;
    const top = openAbove ? r.top - h - gap : r.bottom + gap;
    const left = Math.min(
      Math.max(8, r.left),
      Math.max(8, window.innerWidth - w - 8),
    );
    setPos({ top, left });
  }, [anchor, lookingUp, openLabel, openUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] cursor-default"
        aria-label="Close menu"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[81] min-w-48 overflow-hidden rounded-xl border border-line bg-bg py-1 shadow-xl"
        style={{ top: pos.top, left: pos.left }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          onClick={onCopy}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-2"
        >
          <Copy className="size-3.5 shrink-0 text-muted" />
          Copy IP
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={onOpen}
          disabled={lookingUp}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-2 disabled:opacity-40"
        >
          <ExternalLink className="size-3.5 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block">{lookingUp ? "Looking up Web UI…" : openLabel}</span>
            {openUrl && !lookingUp ? (
              <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                {openUrl.replace(/^https?:\/\//, "")}
              </span>
            ) : null}
          </span>
        </button>
      </div>
    </>,
    document.body,
  );
}
