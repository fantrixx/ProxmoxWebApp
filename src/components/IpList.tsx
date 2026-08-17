import { useApp } from "../context";

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

export function IpList({ ips }: { ips?: string[] }) {
  const { toast } = useApp();
  if (!ips?.length) {
    return <span className="font-mono text-[11px] text-muted">no IP</span>;
  }

  async function copy(ip: string) {
    const ok = await copyText(ip);
    if (ok) toast("ok", `${ip} copied`);
    else toast("err", "Could not copy IP");
  }

  return (
    <span className="flex flex-wrap gap-1.5">
      {ips.map((ip) => (
        <button
          key={ip}
          type="button"
          title="Copy IP"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void copy(ip);
          }}
          className="select-all rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] text-cyan hover:bg-surface-2"
        >
          {ip}
        </button>
      ))}
    </span>
  );
}
