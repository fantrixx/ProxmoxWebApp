import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { shellStorageKey } from "../context";

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

function readSavedBuffer(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeSavedBuffer(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
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
    const storageKey = shellStorageKey(guestType, node, vmid);

    let disposed = false;
    let ws: WebSocket | null = null;
    let keepalive: ReturnType<typeof setInterval> | undefined;
    let saveTimer: ReturnType<typeof setInterval> | undefined;
    let connected = false;
    let sawOutput = false;

    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
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
    const serialize = new SerializeAddon();
    term.loadAddon(fit);
    term.loadAddon(serialize);
    term.loadAddon(new WebLinksAddon());
    term.open(wrapRef.current);
    termRef.current = term;

    const saved = readSavedBuffer(storageKey);
    let restored = false;
    if (saved) {
      term.write(saved);
      if (!saved.endsWith("\n") && !saved.endsWith("\r")) term.write("\r\n");
      term.writeln("\x1b[90m── previous output restored ──\x1b[0m");
      restored = true;
    } else {
      term.writeln("\x1b[90mStarting shell…\x1b[0m");
    }

    const persist = () => {
      try {
        writeSavedBuffer(storageKey, serialize.serialize());
      } catch {
        /* ignore */
      }
    };

    const sendResize = () => {
      fit.fit();
      const cols = Math.max(term.cols, 2);
      const rows = Math.max(term.rows, 1);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(encodeResize(cols, rows));
      }
    };

    const onResizeDisposable = term.onResize(() => {
      if (connected && ws?.readyState === WebSocket.OPEN) {
        ws.send(encodeResize(Math.max(term.cols, 2), Math.max(term.rows, 1)));
      }
    });

    const onData = term.onData((data) => {
      if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(encodeInput(data));
    });

    const wrapEl = wrapRef.current;
    const onPointer = () => term.focus();
    wrapEl.addEventListener("pointerdown", onPointer);

    const connect = () => {
      if (disposed || ws) return;
      fit.fit();

      const proto = location.protocol === "https:" ? "wss" : "ws";
      const qs = new URLSearchParams({
        type: guestType,
        node,
        vmid: String(vmid),
      });
      ws = new WebSocket(`${proto}://${location.host}/ws/console?${qs}`);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (disposed) return;
        sendResize();
        keepalive = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send("2");
        }, 30_000);
      };

      ws.onmessage = (ev) => {
        if (disposed) return;
        if (!sawOutput) {
          sawOutput = true;
          connected = true;
          // Keep restored scrollback; only clear the temporary "Starting…" screen.
          if (!restored) term.reset();
          sendResize();
          term.focus();
        }
        if (typeof ev.data === "string") {
          term.write(ev.data);
        } else {
          term.write(new Uint8Array(ev.data as ArrayBuffer));
        }
        persist();
      };

      ws.onerror = () => {
        if (!disposed) term.writeln("\r\n\x1b[31mWebSocket error\x1b[0m");
      };

      ws.onclose = (ev) => {
        connected = false;
        persist();
        if (disposed) return;
        const reason = ev.reason || `Code ${ev.code}`;
        term.writeln(`\r\n\x1b[90mConsole closed (${reason})\x1b[0m`);
        persist();
      };
    };

    const ro = new ResizeObserver(() => {
      fit.fit();
      if (!ws && wrapEl.clientWidth > 40 && wrapEl.clientHeight > 40) {
        connect();
      } else if (ws?.readyState === WebSocket.OPEN) {
        sendResize();
      }
    });
    ro.observe(wrapEl);

    const bootTimer = window.setTimeout(() => {
      if (!ws) connect();
    }, 300);

    saveTimer = setInterval(persist, 5000);

    const onWinResize = () => sendResize();
    const onHide = () => persist();
    window.addEventListener("resize", onWinResize);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);

    return () => {
      disposed = true;
      persist();
      window.clearTimeout(bootTimer);
      if (saveTimer) clearInterval(saveTimer);
      ro.disconnect();
      onData.dispose();
      onResizeDisposable.dispose();
      if (keepalive) clearInterval(keepalive);
      window.removeEventListener("resize", onWinResize);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      wrapEl.removeEventListener("pointerdown", onPointer);
      ws?.close();
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
          <div className="text-[11px] text-muted">
            Node {node} · keep open to resume · close only to end session
          </div>
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
