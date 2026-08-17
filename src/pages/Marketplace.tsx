import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  Store,
} from "lucide-react";
import { dataApi } from "../api";
import { Header } from "../components/Header";
import { useApp } from "../context";
import { useResources } from "../hooks";
import {
  loadCreatePrefs,
  loadMarketplacePrefs,
  saveMarketplacePrefs,
} from "../prefs";
import type { MarketplaceScript } from "../types";

type KindFilter = "lxc" | "vm" | "host";

function kindLabel(kind: MarketplaceScript["kind"]): string {
  if (kind === "lxc") return "Container";
  if (kind === "vm") return "VM";
  if (kind === "addon") return "Add-on";
  if (kind === "turnkey") return "Turnkey";
  return "Host";
}

function isHostKind(kind: MarketplaceScript["kind"]) {
  return kind === "pve" || kind === "addon" || kind === "turnkey";
}

function resourceLine(script: MarketplaceScript): string {
  const parts: string[] = [];
  if (script.cpu > 0) parts.push(`${script.cpu}C`);
  if (script.ramMb > 0) {
    parts.push(script.ramMb >= 1024 ? `${script.ramMb / 1024} GB RAM` : `${script.ramMb} MB RAM`);
  }
  if (script.diskGb > 0) parts.push(`${script.diskGb} GB disk`);
  if (script.os) {
    parts.push(script.osVersion ? `${script.os} ${script.osVersion}` : script.os);
  }
  return parts.join(" · ");
}

function ScriptLogo({ script, className }: { script: MarketplaceScript; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!script.logo || failed) {
    return (
      <div
        className={`grid place-items-center rounded-xl bg-surface-2 text-sm font-semibold text-muted ${className || "size-12"}`}
      >
        {script.name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={script.logo}
      alt=""
      className={`rounded-xl bg-white/5 object-contain p-1 ${className || "size-12"}`}
      onError={() => setFailed(true)}
    />
  );
}

export default function MarketplacePage() {
  const { user, toast, openNodeConsole } = useApp();
  const resources = useResources();
  const catalog = useQuery({
    queryKey: ["marketplace"],
    queryFn: () => dataApi.marketplace(),
    staleTime: 10 * 60 * 1000,
  });

  const nodes = (resources.data?.resources || [])
    .filter((r) => r.type === "node")
    .map((r) => r.node)
    .filter((n): n is string => Boolean(n));

  const [qtext, setQtext] = useState("");
  const [kind, setKind] = useState<KindFilter>("lxc");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<MarketplaceScript | null>(null);
  const [alpine, setAlpine] = useState(false);
  const [node, setNode] = useState(
    () => loadMarketplacePrefs().node || loadCreatePrefs().node || "",
  );

  const tokenLogin = user.authKind === "token";

  const view = useMemo(() => {
    const scripts = catalog.data?.scripts || [];
    const needle = qtext.trim().toLowerCase();
    return scripts.filter((s) => {
      if (kind === "lxc" && s.kind !== "lxc") return false;
      if (kind === "vm" && s.kind !== "vm") return false;
      if (kind === "host" && !isHostKind(s.kind)) return false;
      if (category !== "all" && !s.categories.some((c) => c.id === category)) return false;
      if (!needle) return true;
      const hay = `${s.name} ${s.slug} ${s.description} ${s.categories.map((c) => c.name).join(" ")}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [catalog.data?.scripts, category, kind, qtext]);

  const categories = useMemo(() => {
    const scripts = catalog.data?.scripts || [];
    const ids = new Set<string>();
    for (const s of scripts) {
      if (kind === "lxc" && s.kind !== "lxc") continue;
      if (kind === "vm" && s.kind !== "vm") continue;
      if (kind === "host" && !isHostKind(s.kind)) continue;
      for (const c of s.categories) ids.add(c.id);
    }
    return (catalog.data?.categories || []).filter((c) => ids.has(c.id));
  }, [catalog.data, kind]);

  function openScript(script: MarketplaceScript) {
    setAlpine(false);
    setSelected(script);
    if (!node && nodes[0]) setNode(nodes[0]);
  }

  function commandFor(script: MarketplaceScript) {
    return alpine && script.alpineCommand ? script.alpineCommand : script.command;
  }

  async function copyCommand(script: MarketplaceScript) {
    const cmd = commandFor(script);
    try {
      await navigator.clipboard.writeText(cmd);
      toast("ok", "Install command copied.");
    } catch {
      toast("err", "Could not copy. Select the command and copy it manually.");
    }
  }

  function install(script: MarketplaceScript) {
    const target = node || nodes[0] || "";
    if (!target) {
      toast("err", "No Proxmox node found.");
      return;
    }
    if (tokenLogin) {
      toast(
        "err",
        "Sign in with your Proxmox password (root@pam). API tokens cannot open the node shell.",
      );
      return;
    }
    saveMarketplacePrefs({ node: target });
    openNodeConsole({
      node: target,
      title: script.name,
      command: commandFor(script),
    });
    toast("info", `Opening ${target} shell. Choose Default or Advanced in the script.`);
    setSelected(null);
  }

  return (
    <div>
      <Header
        title="Marketplace"
        subtitle="Community Helper Scripts · install runs in the Proxmox node shell"
      />
      <div className="px-4 py-4 md:px-8 md:py-6">
        {tokenLogin ? (
          <p className="mb-4 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            Install now needs a password login as root@pam. API tokens cannot open the host shell.
          </p>
        ) : null}

        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                value={qtext}
                onChange={(e) => setQtext(e.target.value)}
                placeholder="Search scripts"
                className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-base outline-none focus:border-accent md:text-sm"
              />
            </label>
            <div className="flex rounded-xl bg-bg p-1">
              {(
                [
                  ["lxc", "Containers"],
                  ["vm", "VMs"],
                  ["host", "Host"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setKind(id);
                    setCategory("all");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    kind === id ? "bg-surface text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void catalog.refetch()}
              className="rounded-lg border border-line p-2 text-muted hover:bg-surface-2 hover:text-ink"
              title="Refresh catalog"
            >
              <RefreshCw className={`size-4 ${catalog.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>

          {categories.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <Chip active={category === "all"} onClick={() => setCategory("all")}>
                All
              </Chip>
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  active={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

        {catalog.isLoading ? (
          <p className="text-sm text-muted">Loading Helper Scripts…</p>
        ) : catalog.isError ? (
          <p className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
            Could not load the catalog. The ProxPanel host needs outbound HTTPS to community-scripts.org.
          </p>
        ) : view.length === 0 ? (
          <p className="text-sm text-muted">No scripts match these filters.</p>
        ) : (
          <>
            <p className="mb-3 text-[11px] tabular-nums text-muted">
              {view.length} script{view.length === 1 ? "" : "s"} · data from {catalog.data?.source}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {view.map((script) => (
                <button
                  key={script.slug}
                  type="button"
                  onClick={() => openScript(script)}
                  className="flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-line-2 hover:bg-surface-2 md:p-4"
                >
                  <ScriptLogo script={script} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="truncate text-sm font-semibold">{script.name}</h2>
                      <span className="shrink-0 rounded-md bg-bg px-1.5 py-0.5 text-[10px] text-muted">
                        {kindLabel(script.kind)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                      {script.description || "Community Helper Script"}
                    </p>
                    <p className="mt-2 text-[11px] text-muted">{resourceLine(script) || "Default resources"}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
          <div className="flex max-h-[min(92dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-start gap-3 border-b border-line p-4">
              <ScriptLogo script={selected} className="size-14" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-tight">{selected.name}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {kindLabel(selected.kind)}
                  {selected.port ? ` · port ${selected.port}` : ""}
                  {selected.privileged ? " · privileged" : ""}
                  {selected.arm ? " · ARM" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-ink"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <p className="text-sm leading-relaxed text-muted">
                {selected.description || "Community Helper Script for Proxmox VE."}
              </p>
              <p className="text-xs text-muted">{resourceLine(selected)}</p>

              {selected.notes.length > 0 ? (
                <ul className="space-y-1.5">
                  {selected.notes.map((note, i) => (
                    <li
                      key={i}
                      className={`rounded-lg px-2.5 py-2 text-xs ${
                        note.type === "warning"
                          ? "bg-warn/10 text-warn"
                          : "bg-bg text-muted"
                      }`}
                    >
                      {note.text}
                    </li>
                  ))}
                </ul>
              ) : null}

              {selected.defaultUser || selected.defaultPassword ? (
                <p className="text-xs text-muted">
                  Default login
                  {selected.defaultUser ? `: ${selected.defaultUser}` : ""}
                  {selected.defaultPassword ? ` / ${selected.defaultPassword}` : ""}
                </p>
              ) : null}

              {selected.hasAlpine ? (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={alpine}
                    onChange={(e) => setAlpine(e.target.checked)}
                    className="accent-accent"
                  />
                  Alpine variant
                </label>
              ) : null}

              <div>
                <label className="mb-1.5 block text-xs text-muted">Proxmox node</label>
                <select
                  value={node}
                  onChange={(e) => setNode(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
                >
                  {nodes.length === 0 ? (
                    <option value="">No nodes</option>
                  ) : null}
                  {nodes.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs text-muted">Install command</span>
                  <button
                    type="button"
                    onClick={() => void copyCommand(selected)}
                    className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
                  >
                    <Copy className="size-3" />
                    Copy
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-xl bg-bg p-3 font-mono text-[11px] leading-relaxed text-ink/90">
                  {commandFor(selected)}
                </pre>
              </div>

              <p className="text-[11px] leading-relaxed text-muted">
                This downloads and runs a community script as root on the selected node.
                The script asks Default or Advanced in the shell. Not affiliated with Proxmox.
              </p>

              <div className="flex flex-wrap gap-3 text-xs">
                <a
                  href={selected.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-muted hover:text-ink"
                >
                  <ExternalLink className="size-3" />
                  Script page
                </a>
                {selected.website ? (
                  <a
                    href={selected.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-muted hover:text-ink"
                  >
                    <ExternalLink className="size-3" />
                    Website
                  </a>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2 sm:min-h-0 sm:py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => install(selected)}
                disabled={tokenLogin || (!node && nodes.length === 0)}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
              >
                <Store className="size-3.5" />
                Install now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
        active ? "bg-accent text-black" : "border border-line bg-surface text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
