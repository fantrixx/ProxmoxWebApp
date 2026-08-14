import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { useApp } from "../context";

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

export function TerminalModal() {
  const { consoleTarget, closeConsole } = useApp();
  const wrapRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!consoleTarget || !wrapRef.current) return;

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
      type: consoleTarget.type,
      node: consoleTarget.node,
      vmid: String(consoleTarget.vmid),
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
      term.writeln("\x1b[90mVerbinde mit Proxmox-Konsole…\x1b[0m");
      sendResize();
      // termproxy idle timeout ~5 min — keep alive with protocol ping "2"
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
    ws.onerror = () => term.writeln("\r\n\x1b[31mWebSocket-Fehler\x1b[0m");
    ws.onclose = (ev) => {
      const reason = ev.reason || `Code ${ev.code}`;
      term.writeln(`\r\n\x1b[90mKonsole beendet (${reason})\x1b[0m`);
    };

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeInput(data));
    });

    const onResize = () => sendResize();
    window.addEventListener("resize", onResize);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConsole();
    };
    window.addEventListener("keydown", onKey);

    const wrapEl = wrapRef.current;
    const onPointer = () => term.focus();
    wrapEl.addEventListener("pointerdown", onPointer);

    return () => {
      onData.dispose();
      if (keepalive) clearInterval(keepalive);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      wrapEl.removeEventListener("pointerdown", onPointer);
      ws.close();
      term.dispose();
      termRef.current = null;
    };
  }, [consoleTarget, closeConsole]);

  if (!consoleTarget) return null;

  const kind = consoleTarget.type === "lxc" ? "CT" : "VM";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/80 p-0 md:items-center md:p-6">
      <div className="flex h-full w-full flex-col overflow-hidden border-line bg-bg shadow-2xl md:h-[min(860px,92vh)] md:w-[min(1100px,96vw)] md:rounded-2xl md:border">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              Shell · {kind} {consoleTarget.vmid} · {consoleTarget.name}
            </div>
            <div className="hidden text-[11px] text-muted sm:block">
              Node {consoleTarget.node} · Esc zum Schließen
            </div>
          </div>
          <button
            type="button"
            onClick={closeConsole}
            className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-ink"
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
    </div>
  );
}
