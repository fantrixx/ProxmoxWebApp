import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

const textEncoder = new TextEncoder();

/** Proxmox termproxy: 0:BYTE_LENGTH:MSG */
function encodeInput(data: string): string {
  const bytes = textEncoder.encode(data);
  return `0:${bytes.length}:${data}`;
}

/** Proxmox termproxy: 1:COLS:ROWS: */
function encodeResize(cols: number, rows: number): string {
  return `1:${cols}:${rows}:`;
}

export default function ConsolePage() {
  const { type, node, vmid } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  const name = search.get("name") || vmid || "guest";
  const guestType = type === "qemu" ? "qemu" : "lxc";
  const kind = guestType === "lxc" ? "CT" : "VM";

  function closeWindow() {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    navigate(-1);
  }

  useEffect(() => {
    if (!node || !vmid || !wrapRef.current) return;

    document.title = `Shell · ${kind} ${vmid} · ${name} — ProxPanel`;

    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: isMobile ? 12 : 14,
      theme: {
        background: "#0b0d12",
        foreground: "#eef3fb",
        cursor: "#ff7a1a",
        selectionBackground: "#ff7a1a55",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(wrapRef.current);
    fit.fit();
    term.focus();
    termRef.current = term;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const qs = new URLSearchParams({
      type: guestType,
      node,
      vmid: String(vmid),
    });
    const ws = new WebSocket(`${proto}://${location.host}/ws/console?${qs}`);
    ws.binaryType = "arraybuffer";

    let keepalive: ReturnType<typeof setInterval> | undefined;

    const sendResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encodeResize(term.cols, term.rows));
      }
    };

    ws.onopen = () => {
      term.writeln("\x1b[90mConnecting to Proxmox console…\x1b[0m");
      sendResize();
      keepalive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("2");
      }, 30_000);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        term.write(ev.data);
      } else {
        term.write(new Uint8Array(ev.data as ArrayBuffer));
      }
    };
    ws.onerror = () => term.writeln("\r\n\x1b[31mWebSocket error\x1b[0m");
    ws.onclose = (ev) => {
      const reason = ev.reason || `Code ${ev.code}`;
      term.writeln(`\r\n\x1b[90mConsole closed (${reason})\x1b[0m`);
    };

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeInput(data));
    });

    const onResize = () => sendResize();
    window.addEventListener("resize", onResize);

    const wrapEl = wrapRef.current;
    const onPointer = () => term.focus();
    wrapEl.addEventListener("pointerdown", onPointer);

    return () => {
      onData.dispose();
      if (keepalive) clearInterval(keepalive);
      window.removeEventListener("resize", onResize);
      wrapEl.removeEventListener("pointerdown", onPointer);
      ws.close();
      term.dispose();
      termRef.current = null;
      document.title = "ProxPanel — Proxmox Administration";
    };
  }, [guestType, kind, name, node, vmid]);

  if (!node || !vmid) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Invalid console target.
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            Shell · {kind} {vmid} · {name}
          </div>
          <div className="text-[11px] text-muted">Node {node} · detached window</div>
        </div>
        <button
          type="button"
          onClick={closeWindow}
          className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-ink"
          title="Close"
        >
          <X className="size-4" />
        </button>
      </div>
      <div
        ref={wrapRef}
        className="min-h-0 flex-1 cursor-text bg-bg p-2"
        onClick={() => termRef.current?.focus()}
      />
    </div>
  );
}
