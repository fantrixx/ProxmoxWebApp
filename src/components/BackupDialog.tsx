import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { dataApi } from "../api";
import { formatBytes, formatSnapTime } from "../format";
import { useApp } from "../context";
import type { GuestType, MediaItem } from "../types";

function backupStorageOf(item: MediaItem): string {
  if (item.storage) return item.storage;
  const idx = item.volid.indexOf(":");
  return idx > 0 ? item.volid.slice(0, idx) : item.volid;
}

function backupFileOf(item: MediaItem): string {
  const idx = item.volid.indexOf(":");
  return idx >= 0 ? item.volid.slice(idx + 1) : item.volid;
}

export function BackupDialog({
  open,
  onClose,
  node,
  type,
  vmid,
  name,
}: {
  open: boolean;
  onClose: () => void;
  node: string;
  type: GuestType;
  vmid: number | string;
  name?: string;
}) {
  const { toast } = useApp();
  const qc = useQueryClient();
  const vmidStr = String(vmid);
  const [storage, setStorage] = useState("");
  const [mode, setMode] = useState<"snapshot" | "suspend" | "stop">("snapshot");
  const [compress, setCompress] = useState<"zstd" | "gzip" | "lzo" | "none">("zstd");

  const storages = useQuery({
    queryKey: ["backupStorages"],
    queryFn: () => dataApi.backupStorages(),
    enabled: open,
  });

  const backups = useQuery({
    queryKey: ["guestBackups", node, type, vmidStr],
    queryFn: () => dataApi.guestBackups(node, type, vmidStr),
    enabled: open,
  });

  const nodeStorages = useMemo(() => {
    const all = storages.data?.storages || [];
    return all.filter((s) => s.node === node || s.shared);
  }, [storages.data, node]);

  useEffect(() => {
    if (!open) return;
    if (!storage && nodeStorages[0]?.storage) {
      setStorage(nodeStorages[0].storage);
    }
  }, [open, nodeStorages, storage]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const selectedStorage = storage || nodeStorages[0]?.storage || "";

  const allBackups = useMemo(
    () => [...(backups.data?.backups || [])].sort((a, b) => (b.ctime || 0) - (a.ctime || 0)),
    [backups.data],
  );

  const locationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allBackups) {
      const store = backupStorageOf(item);
      counts.set(store, (counts.get(store) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allBackups]);

  const locationCount = locationCounts.length;

  const filteredList = useMemo(
    () => allBackups.filter((item) => backupStorageOf(item) === selectedStorage),
    [allBackups, selectedStorage],
  );

  const start = useMutation({
    mutationFn: () =>
      dataApi.startBackup(node, type, vmidStr, {
        storage: selectedStorage,
        mode,
        compress,
      }),
    onSuccess: () => {
      toast("ok", "Backup started — see Tasks for progress.");
      void qc.invalidateQueries({ queryKey: ["guestBackups", node, type, vmidStr] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  if (!open) return null;

  const title = name || `Guest ${vmid}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center sm:p-6">
      <div className="flex h-[min(90dvh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight">Create backup</h2>
              <p className="mt-0.5 truncate text-sm text-muted">
                {title} · {type === "lxc" ? "CT" : "VM"} {vmid} on {node}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink sm:min-h-0 sm:min-w-0"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="group relative mt-3 inline-block">
            <p
              className="cursor-default text-sm text-muted underline decoration-dotted underline-offset-4"
              tabIndex={0}
            >
              {backups.isLoading
                ? "Checking backup locations…"
                : locationCount === 0
                  ? "No backup locations yet"
                  : locationCount === 1
                    ? "Backups on 1 location"
                    : `Backups on ${locationCount} locations`}
            </p>
            {!backups.isLoading && locationCount > 0 ? (
              <div
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full z-10 mt-2 hidden min-w-[11rem] rounded-xl border border-line bg-bg px-3 py-2 text-xs shadow-xl group-hover:block group-focus-within:block"
              >
                <div className="mb-1.5 font-medium text-ink">Backup overview</div>
                <ul className="space-y-1">
                  {locationCounts.map(([store, count]) => (
                    <li key={store} className="flex items-center justify-between gap-4 text-muted">
                      <span className="truncate font-mono">{store}</span>
                      <span className="shrink-0 tabular-nums text-ink">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          <form
            id="backup-dialog-form"
            className="grid shrink-0 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedStorage) return;
              start.mutate();
            }}
          >
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs text-muted">Storage</span>
              <select
                value={selectedStorage}
                onChange={(e) => setStorage(e.target.value)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
                disabled={storages.isLoading || nodeStorages.length === 0}
                required
              >
                {nodeStorages.length === 0 ? (
                  <option value="">No backup storage found</option>
                ) : (
                  nodeStorages.map((s) => (
                    <option key={`${s.node}:${s.storage}`} value={s.storage}>
                      {s.storage}
                      {s.shared ? " (shared)" : ""}
                      {s.node !== node ? ` · ${s.node}` : ""}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs text-muted">Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
              >
                <option value="snapshot">Snapshot (recommended)</option>
                <option value="suspend">Suspend</option>
                <option value="stop">Stop</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs text-muted">Compression</span>
              <select
                value={compress}
                onChange={(e) => setCompress(e.target.value as typeof compress)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
              >
                <option value="zstd">zstd</option>
                <option value="gzip">gzip</option>
                <option value="lzo">lzo</option>
                <option value="none">none</option>
              </select>
            </label>
          </form>

          {storages.isError ? (
            <p className="mt-3 shrink-0 text-sm text-bad">{(storages.error as Error).message}</p>
          ) : null}

          <section className="mt-5 flex min-h-0 flex-1 flex-col">
            <h3 className="mb-2 shrink-0 text-sm font-medium text-muted">
              Previous backups
              {selectedStorage ? (
                <span className="font-normal">
                  {" "}
                  on <span className="font-mono text-ink/80">{selectedStorage}</span>
                </span>
              ) : null}
            </h3>
            {backups.isLoading ? (
              <p className="text-sm text-muted">Loading backups…</p>
            ) : backups.isError ? (
              <p className="text-sm text-bad">{(backups.error as Error).message}</p>
            ) : filteredList.length === 0 ? (
              <p className="text-sm text-muted">
                {allBackups.length === 0
                  ? "No backups for this guest yet."
                  : "No backups on this storage."}
              </p>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {filteredList.map((item) => {
                  const store = backupStorageOf(item);
                  return (
                    <li key={item.volid} className="px-3 py-2.5">
                      <div className="truncate font-mono text-xs">{backupFileOf(item)}</div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {formatSnapTime(item.ctime)} · {formatBytes(item.size)} ·{" "}
                        <span className="font-mono text-ink/70">{store}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="mt-3 shrink-0 text-xs text-muted">
            Progress appears on the{" "}
            <Link to="/tasks" className="text-accent hover:underline" onClick={onClose}>
              Tasks
            </Link>{" "}
            page.
          </p>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={start.isPending}
            onClick={onClose}
            className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-40 sm:min-h-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="backup-dialog-form"
            disabled={start.isPending || !selectedStorage}
            className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0"
          >
            {start.isPending ? "Starting…" : "Start backup"}
          </button>
        </div>
      </div>
    </div>
  );
}
