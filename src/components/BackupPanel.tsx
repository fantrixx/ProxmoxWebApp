import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { dataApi } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatBytes, formatSnapTime } from "../format";
import { useApp } from "../context";
import { loadBackupPrefs } from "../prefs";
import type { GuestType, MediaItem } from "../types";

function volname(volid: string): string {
  const idx = volid.indexOf(":");
  return idx >= 0 ? volid.slice(idx + 1) : volid;
}

function storageFromVolid(volid: string): string {
  const idx = volid.indexOf(":");
  return idx >= 0 ? volid.slice(0, idx) : "";
}

export function BackupPanel({
  node,
  type,
  vmid,
  name,
}: {
  node: string;
  type: GuestType;
  vmid: string;
  name?: string;
}) {
  const { toast, trackJob, attachJobUpid, failJob, startGuestBackup } = useApp();
  const qc = useQueryClient();
  const prefs = loadBackupPrefs();
  const [storage, setStorage] = useState(prefs.storage || "");
  const [mode, setMode] = useState<"snapshot" | "suspend" | "stop">(
    prefs.mode || "snapshot",
  );
  const [compress, setCompress] = useState<"zstd" | "gzip" | "lzo" | "none">(
    prefs.compress || "zstd",
  );
  const [restoreTarget, setRestoreTarget] = useState<MediaItem | null>(null);
  const [restoreVmid, setRestoreVmid] = useState(vmid);
  const [restoreForce, setRestoreForce] = useState(false);
  const [restoreStorage, setRestoreStorage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);

  const storages = useQuery({
    queryKey: ["backupStorages"],
    queryFn: () => dataApi.backupStorages(),
  });

  const backups = useQuery({
    queryKey: ["guestBackups", node, type, vmid],
    queryFn: () => dataApi.guestBackups(node, type, vmid),
  });

  const nodeStorages = useMemo(() => {
    const all = storages.data?.storages || [];
    return all.filter((s) => s.node === node || s.shared);
  }, [storages.data, node]);

  useEffect(() => {
    if (storage) {
      if (nodeStorages.some((s) => s.storage === storage)) return;
    }
    const pref = loadBackupPrefs().storage;
    if (pref && nodeStorages.some((s) => s.storage === pref)) {
      setStorage(pref);
      return;
    }
    if (nodeStorages[0]?.storage) setStorage(nodeStorages[0].storage);
  }, [nodeStorages, storage]);

  const selectedStorage = storage || nodeStorages[0]?.storage || "";

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["guestBackups", node, type, vmid] });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  const start = useMutation({
    mutationFn: async () => {
      await startGuestBackup({
        node,
        type,
        vmid,
        name,
        storage: selectedStorage,
        mode,
        compress,
      });
    },
    onSuccess: () => invalidate(),
  });

  function handleStartBackup() {
    if (!selectedStorage || start.isPending) {
      if (!selectedStorage) toast("err", "Select a backup storage first.");
      return;
    }
    start.mutate();
  }

  const restore = useMutation({
    mutationFn: (vars: {
      archive: string;
      targetVmid: number;
      storage?: string;
      force: boolean;
    }) =>
      dataApi.restoreBackup({
        node,
        type,
        vmid: vars.targetVmid,
        archive: vars.archive,
        storage: vars.storage,
        force: vars.force,
      }),
  });

  function handleRestore() {
    if (!restoreTarget || restore.isPending) return;
    const label = name || `Guest ${vmid}`;
    const vars = {
      archive: restoreTarget.volid,
      targetVmid: Number(restoreVmid),
      storage: restoreStorage.trim() || undefined,
      force: restoreForce,
    };
    const jobId = trackJob({
      kind: "restore",
      title: `Restore · ${label}`,
      detail: `${type === "lxc" ? "CT" : "VM"} ${restoreVmid} · ${node}`,
      node,
      upid: "",
      vmid: String(restoreVmid),
    });
    setRestoreTarget(null);
    restore.mutate(vars, {
      onSuccess: (res) => {
        if (res.upid) {
          attachJobUpid(jobId, res.upid);
          toast("ok", "Restore started.");
        } else {
          failJob(jobId, "No task id returned by Proxmox.");
          toast("err", "Restore started but no task id was returned.");
        }
        invalidate();
      },
      onError: (err: Error) => {
        failJob(jobId, err.message);
        toast("err", err.message);
      },
    });
  }

  const remove = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("No backup selected.");
      return dataApi.deleteBackup({
        node: deleteTarget.node || node,
        storage: storageFromVolid(deleteTarget.volid),
        volume: deleteTarget.volid,
      });
    },
    onSuccess: () => {
      toast("ok", "Backup deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const busy = start.isPending || restore.isPending || remove.isPending;
  const list = backups.data?.backups || [];

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-sm font-medium text-muted">Backups</h2>

      <form
        className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          handleStartBackup();
        }}
      >
        <label>
          <span className="mb-1 block text-[11px] text-muted">Storage</span>
          <select
            value={selectedStorage}
            onChange={(e) => setStorage(e.target.value)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-accent md:text-sm"
            disabled={storages.isLoading || nodeStorages.length === 0}
          >
            {nodeStorages.map((s) => (
              <option key={`${s.node}:${s.storage}`} value={s.storage}>
                {s.storage}
                {s.shared ? " (shared)" : ""}
                {s.node !== node ? ` · ${s.node}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] text-muted">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-accent md:text-sm"
          >
            <option value="snapshot">Snapshot</option>
            <option value="suspend">Suspend</option>
            <option value="stop">Stop</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] text-muted">Compress</span>
          <select
            value={compress}
            onChange={(e) => setCompress(e.target.value as typeof compress)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-accent md:text-sm"
          >
            <option value="zstd">zstd</option>
            <option value="gzip">gzip</option>
            <option value="lzo">lzo</option>
            <option value="none">none</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !selectedStorage}
          className="min-h-11 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0 sm:py-2"
        >
          {start.isPending ? "Starting…" : "Start backup"}
        </button>
      </form>

      {storages.isError ? (
        <p className="mb-4 text-sm text-bad">{(storages.error as Error).message}</p>
      ) : null}

      {backups.isError ? (
        <p className="text-sm text-bad">{(backups.error as Error).message}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">No backups for this guest yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((item) => (
            <li key={item.volid} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm">{volname(item.volid)}</div>
                <div className="text-xs text-muted">
                  {formatSnapTime(item.ctime)} · {formatBytes(item.size)}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRestoreVmid(vmid);
                  setRestoreForce(false);
                  setRestoreStorage("");
                  setRestoreTarget(item);
                }}
                className="min-h-11 flex-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface-2 disabled:opacity-40 sm:min-h-0 sm:flex-none sm:py-1.5"
              >
                Restore
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteTarget(item)}
                className="min-h-11 flex-1 rounded-lg border border-bad/40 px-2.5 py-2 text-xs text-bad hover:bg-bad/10 disabled:opacity-40 sm:min-h-0 sm:flex-none sm:py-1.5"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted">
        Progress appears on the{" "}
        <Link to="/tasks" className="text-accent hover:underline">
          Tasks
        </Link>{" "}
        page.
      </p>

      {restoreTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center sm:p-6">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <h2 className="text-lg font-semibold tracking-tight">Restore backup?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Restore {volname(restoreTarget.volid)}
              {name ? ` for ${name}` : ""}. This starts a background task.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">Target VMID</span>
                <input
                  type="number"
                  value={restoreVmid}
                  onChange={(e) => setRestoreVmid(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">Storage (optional)</span>
                <input
                  value={restoreStorage}
                  onChange={(e) => setRestoreStorage(e.target.value)}
                  placeholder="default from archive"
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={restoreForce}
                  onChange={(e) => setRestoreForce(e.target.checked)}
                  className="accent-accent"
                />
                Force overwrite if VMID exists
              </label>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={restore.isPending}
                onClick={() => setRestoreTarget(null)}
                className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restore.isPending || !restoreVmid.trim()}
                onClick={() => handleRestore()}
                className="min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
              >
                {restore.isPending ? "Please wait…" : "Restore"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete backup?"
          body={`Permanently delete ${volname(deleteTarget.volid)}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          busy={remove.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </section>
  );
}
