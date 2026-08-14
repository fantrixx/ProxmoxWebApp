import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { useApp } from "../context";

export function TerminalModal() {
  const { consoleTarget, closeConsole } = useApp();
  const wrapRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!consoleTarget || !wrapRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: 14,
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

    ws.onopen = () => term.writeln("\x1b[90mVerbinde mit Proxmox-Konsole…\x1b[0m");
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
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConsole();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      onData.dispose();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      ws.close();
      term.dispose();
      termRef.current = null;
    };
  }, [consoleTarget, closeConsole]);

  if (!consoleTarget) return null;

  const kind = consoleTarget.type === "lxc" ? "CT" : "VM";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="flex h-[min(860px,92vh)] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-2xl border border-line bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium">
              Shell · {kind} {consoleTarget.vmid} · {consoleTarget.name}
            </div>
            <div className="text-[11px] text-muted">
              Node {consoleTarget.node} · Esc zum Schließen
            </div>
          </div>
          <button
            type="button"
            onClick={closeConsole}
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div ref={wrapRef} className="min-h-0 flex-1 bg-bg p-2" />
      </div>
    </div>
  );
}
