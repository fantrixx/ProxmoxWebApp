import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { dataApi } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Header } from "../components/Header";
import { useApp } from "../context";
import { formatBytes, formatSnapTime } from "../format";
import type { IsoUsageEntry, MediaItem, MediaStorage } from "../types";

type Tab = "isos" | "templates";
type SortKey = "name" | "size" | "date";

function volname(volid: string): string {
  const idx = volid.indexOf(":");
  return idx >= 0 ? volid.slice(idx + 1) : volid;
}

function storageKey(s: MediaStorage): string {
  return `${s.node}::${s.storage}`;
}

function parseStorageKey(key: string): { node: string; storage: string } | null {
  const idx = key.indexOf("::");
  if (idx < 0) return null;
  return { node: key.slice(0, idx), storage: key.slice(idx + 2) };
}

function guessFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = u.pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(base.split("?")[0] || "") || "";
  } catch {
    return "";
  }
}

export default function MediaPage() {
  const { toast } = useApp();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("isos");
  const [qtext, setQtext] = useState("");
  const [storageFilter, setStorageFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dragOver, setDragOver] = useState(false);

  const [uploadTarget, setUploadTarget] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const [downloadTarget, setDownloadTarget] = useState("");

  const [deleteItem, setDeleteItem] = useState<MediaItem | null>(null);
  const [attachItem, setAttachItem] = useState<MediaItem | null>(null);
  const [attachVm, setAttachVm] = useState("");

  const contentKind = tab === "isos" ? "iso" : "vztmpl";

  const isos = useQuery({
    queryKey: ["mediaIsos"],
    queryFn: () => dataApi.mediaIsos(),
    enabled: tab === "isos",
  });

  const templates = useQuery({
    queryKey: ["mediaTemplates"],
    queryFn: () => dataApi.mediaTemplates(),
    enabled: tab === "templates",
  });

  const storages = useQuery({
    queryKey: ["mediaStorages", contentKind],
    queryFn: () => dataApi.mediaStorages(contentKind),
  });

  const usage = useQuery({
    queryKey: ["mediaIsoUsage"],
    queryFn: () => dataApi.mediaIsoUsage(),
    enabled: tab === "isos",
  });

  const resources = useQuery({
    queryKey: ["resources"],
    queryFn: () => dataApi.resources(),
    enabled: Boolean(attachItem),
  });

  const active = tab === "isos" ? isos : templates;
  const items = tab === "isos" ? isos.data?.items || [] : templates.data?.items || [];
  const storageOptions = storages.data?.storages || [];
  const usageMap = usage.data?.usage || {};

  useEffect(() => {
    setStorageFilter("all");
    setUploadTarget("");
    setDownloadTarget("");
  }, [tab]);

  useEffect(() => {
    if (!uploadTarget && storageOptions.length === 1) {
      setUploadTarget(storageKey(storageOptions[0]));
    }
    if (!downloadTarget && storageOptions.length === 1) {
      setDownloadTarget(storageKey(storageOptions[0]));
    }
  }, [storageOptions, uploadTarget, downloadTarget]);

  const storageLabels = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(item.storage);
    return [...set].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const needle = qtext.trim().toLowerCase();
    const list = items.filter((item) => {
      if (storageFilter !== "all" && item.storage !== storageFilter) return false;
      if (!needle) return true;
      const hay = `${volname(item.volid)} ${item.storage} ${item.node}`.toLowerCase();
      return hay.includes(needle);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === "size") {
        return ((a.size || 0) - (b.size || 0)) * dir;
      }
      if (sortKey === "date") {
        return ((a.ctime || 0) - (b.ctime || 0)) * dir;
      }
      return volname(a.volid).localeCompare(volname(b.volid)) * dir;
    });
    return list;
  }, [items, qtext, storageFilter, sortKey, sortDir]);

  const vms = useMemo(() => {
    return (resources.data?.resources || [])
      .filter((r) => r.type === "qemu" && r.node && r.vmid != null && !r.template)
      .map((r) => ({
        key: `${r.node}:${r.vmid}`,
        node: r.node!,
        vmid: r.vmid!,
        name: r.name || `VM ${r.vmid}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [resources.data]);

  const invalidateMedia = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["mediaIsos"] }),
      qc.invalidateQueries({ queryKey: ["mediaTemplates"] }),
      qc.invalidateQueries({ queryKey: ["mediaIsoUsage"] }),
    ]);
  };

  const uploadMut = useMutation({
    mutationFn: (file: File) => {
      const target = parseStorageKey(uploadTarget);
      if (!target) throw new Error("Select a storage for upload.");
      return dataApi.mediaUpload({
        node: target.node,
        storage: target.storage,
        content: contentKind,
        file,
      });
    },
    onSuccess: () => {
      toast("ok", "Upload finished.");
      void invalidateMedia();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const downloadMut = useMutation({
    mutationFn: () => {
      const target = parseStorageKey(downloadTarget);
      if (!target) throw new Error("Select a storage.");
      const filename = downloadName.trim() || guessFilenameFromUrl(downloadUrl);
      if (!filename) throw new Error("Filename is required.");
      return dataApi.mediaDownloadUrl({
        node: target.node,
        storage: target.storage,
        url: downloadUrl.trim(),
        filename,
        content: contentKind,
      });
    },
    onSuccess: () => {
      toast("ok", "Download started on the node.");
      setDownloadOpen(false);
      setDownloadUrl("");
      setDownloadName("");
      void invalidateMedia();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (item: MediaItem) =>
      dataApi.mediaDelete({
        node: item.node,
        storage: item.storage,
        volume: item.volid,
      }),
    onSuccess: () => {
      toast("ok", "Deleted.");
      setDeleteItem(null);
      void invalidateMedia();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const attachMut = useMutation({
    mutationFn: async () => {
      if (!attachItem || !attachVm) throw new Error("Select a VM.");
      const [node, vmid] = attachVm.split(":");
      return dataApi.setCdrom(node, vmid, { volid: attachItem.volid });
    },
    onSuccess: () => {
      toast("ok", "ISO attached to CD/DVD.");
      setAttachItem(null);
      setAttachVm("");
      void qc.invalidateQueries({ queryKey: ["mediaIsoUsage"] });
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const startUpload = (files: FileList | File[] | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!uploadTarget) {
      toast("err", "Select a storage first.");
      return;
    }
    uploadMut.mutate(file);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sortMark = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div>
      <Header
        title="Media"
        subtitle={
          tab === "isos"
            ? `${filtered.length} ISO image${filtered.length === 1 ? "" : "s"}`
            : `${filtered.length} template${filtered.length === 1 ? "" : "s"}`
        }
      />

      <div className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <TabBtn active={tab === "isos"} onClick={() => setTab("isos")}>
            ISOs
          </TabBtn>
          <TabBtn active={tab === "templates"} onClick={() => setTab("templates")}>
            CT Templates
          </TabBtn>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDownloadOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2 sm:min-h-0"
            >
              <Download className="h-4 w-4" />
              From URL
            </button>
            <button
              type="button"
              disabled={!uploadTarget || uploadMut.isPending}
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0"
            >
              <Upload className="h-4 w-4" />
              {uploadMut.isPending ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={tab === "isos" ? ".iso,application/x-cd-image" : undefined}
              onChange={(e) => {
                startUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            startUpload(e.dataTransfer.files);
          }}
          className={`rounded-2xl border border-dashed px-4 py-5 text-sm transition ${
            dragOver
              ? "border-accent bg-accent/10 text-ink"
              : "border-line bg-surface/50 text-muted"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex-1">
              Drop {tab === "isos" ? "an ISO" : "a template"} here, or use Upload.
              Choose the target storage below.
            </p>
            <label className="sm:w-64">
              <span className="mb-1 block text-[11px] text-muted">Upload storage</span>
              <select
                value={uploadTarget}
                onChange={(e) => setUploadTarget(e.target.value)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">— select —</option>
                {storageOptions.map((s) => (
                  <option key={storageKey(s)} value={storageKey(s)}>
                    {s.storage} · {s.node}
                    {s.shared ? " (shared)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={qtext}
              onChange={(e) => setQtext(e.target.value)}
              placeholder="Search name, storage, node…"
              className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="sm:w-52">
            <span className="sr-only">Storage filter</span>
            <select
              value={storageFilter}
              onChange={(e) => setStorageFilter(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="all">All storages</option>
              {storageLabels.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {active.isError ? (
          <p className="text-sm text-bad">{(active.error as Error).message}</p>
        ) : active.isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">No media matches these filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">
                    <button type="button" onClick={() => toggleSort("name")} className="hover:text-ink">
                      Volume{sortMark("name")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button type="button" onClick={() => toggleSort("size")} className="hover:text-ink">
                      Size{sortMark("size")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Storage</th>
                  <th className="px-4 py-3 font-medium">Node</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    <button type="button" onClick={() => toggleSort("date")} className="hover:text-ink">
                      Created{sortMark("date")}
                    </button>
                  </th>
                  {tab === "isos" ? (
                    <th className="px-4 py-3 font-medium">In use</th>
                  ) : null}
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((item) => {
                  const users = usageMap[item.volid] || [];
                  return (
                    <tr key={`${item.node}:${item.volid}`} className="hover:bg-surface-2/40">
                      <td className="max-w-xs truncate px-4 py-3 font-mono text-xs" title={item.volid}>
                        {volname(item.volid)}
                      </td>
                      <td className="px-4 py-3 text-muted">{formatBytes(item.size)}</td>
                      <td className="px-4 py-3 text-muted">{item.storage}</td>
                      <td className="px-4 py-3 text-muted">{item.node}</td>
                      <td className="hidden px-4 py-3 text-muted sm:table-cell">
                        {formatSnapTime(item.ctime)}
                      </td>
                      {tab === "isos" ? (
                        <td className="px-4 py-3 text-muted">
                          <UsageCell users={users} loading={usage.isLoading} />
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {tab === "isos" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAttachItem(item);
                                setAttachVm("");
                              }}
                              className="rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-surface-2"
                            >
                              Attach
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setDeleteItem(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-bad hover:bg-bad/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {downloadOpen ? (
        <Modal
          title={`Download ${tab === "isos" ? "ISO" : "template"} from URL`}
          onClose={() => !downloadMut.isPending && setDownloadOpen(false)}
        >
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">URL</span>
              <input
                value={downloadUrl}
                onChange={(e) => {
                  setDownloadUrl(e.target.value);
                  if (!downloadName.trim()) {
                    setDownloadName(guessFilenameFromUrl(e.target.value));
                  }
                }}
                placeholder="https://…"
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">Filename</span>
              <input
                value={downloadName}
                onChange={(e) => setDownloadName(e.target.value)}
                placeholder={tab === "isos" ? "ubuntu.iso" : "debian.tar.zst"}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">Storage</span>
              <select
                value={downloadTarget}
                onChange={(e) => setDownloadTarget(e.target.value)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
              >
                <option value="">— select —</option>
                {storageOptions.map((s) => (
                  <option key={storageKey(s)} value={storageKey(s)}>
                    {s.storage} · {s.node}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={downloadMut.isPending}
                onClick={() => setDownloadOpen(false)}
                className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={downloadMut.isPending || !downloadUrl.trim() || !downloadTarget}
                onClick={() => downloadMut.mutate()}
                className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40"
              >
                {downloadMut.isPending ? "Starting…" : "Download"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {attachItem ? (
        <Modal
          title="Attach ISO to VM"
          onClose={() => !attachMut.isPending && setAttachItem(null)}
        >
          <p className="mb-3 text-sm text-muted">
            Mount{" "}
            <span className="font-mono text-ink">{volname(attachItem.volid)}</span> as
            CD/DVD on a VM.
          </p>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Virtual machine</span>
            <select
              value={attachVm}
              onChange={(e) => setAttachVm(e.target.value)}
              disabled={resources.isLoading || attachMut.isPending}
              className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="">— select VM —</option>
              {vms.map((vm) => (
                <option key={vm.key} value={vm.key}>
                  {vm.name} ({vm.vmid}) · {vm.node}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={attachMut.isPending}
              onClick={() => setAttachItem(null)}
              className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={attachMut.isPending || !attachVm}
              onClick={() => attachMut.mutate()}
              className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40"
            >
              {attachMut.isPending ? "Attaching…" : "Attach"}
            </button>
          </div>
        </Modal>
      ) : null}

      {deleteItem ? (
        <ConfirmDialog
          title={`Delete ${tab === "isos" ? "ISO" : "template"}?`}
          body={
            (usageMap[deleteItem.volid]?.length
              ? `This ISO is mounted on ${usageMap[deleteItem.volid].length} VM(s). `
              : "") +
            `Permanently remove ${volname(deleteItem.volid)} from ${deleteItem.storage} on ${deleteItem.node}?`
          }
          confirmLabel="Delete"
          danger
          busy={deleteMut.isPending}
          onCancel={() => setDeleteItem(null)}
          onConfirm={() => deleteMut.mutate(deleteItem)}
        />
      ) : null}
    </div>
  );
}

function UsageCell({
  users,
  loading,
}: {
  users: IsoUsageEntry[];
  loading: boolean;
}) {
  if (loading) return <span className="text-xs">…</span>;
  if (users.length === 0) return <span className="text-xs">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {users.slice(0, 3).map((u) => (
        <Link
          key={`${u.node}-${u.vmid}-${u.drive}`}
          to={`/guest/qemu/${encodeURIComponent(u.node)}/${u.vmid}`}
          className="text-xs text-accent hover:underline"
          title={`${u.drive} on ${u.node}`}
        >
          {u.name} ({u.vmid})
        </Link>
      ))}
      {users.length > 3 ? (
        <span className="text-[11px] text-muted">+{users.length - 3} more</span>
      ) : null}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
}: {
  children: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
