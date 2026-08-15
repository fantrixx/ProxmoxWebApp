import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Box, Cpu, HardDrive, ImagePlus, Network, Server, X } from "lucide-react";
import { dataApi } from "../api";
import { useApp } from "../context";
import { loadCreatePrefs, saveCreatePrefs } from "../prefs";
import type { GuestType } from "../types";
import {
  GuestIconPicker,
  LogoPreview,
  persistIconDraft,
  resolveIconSrc,
  type IconDraft,
} from "./GuestIconPicker";

function volname(volid: string): string {
  const idx = volid.indexOf(":");
  return idx >= 0 ? volid.slice(idx + 1) : volid;
}

function storageKey(node: string, storage: string): string {
  return `${node}::${storage}`;
}

function parseStorageKey(key: string): { node: string; storage: string } | null {
  const idx = key.indexOf("::");
  if (idx < 0) return null;
  return { node: key.slice(0, idx), storage: key.slice(idx + 2) };
}

function randomPassword(len = 16): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

type FormState = {
  name: string;
  vmid: string;
  node: string;
  cores: string;
  memory: string;
  swap: string;
  diskGiB: string;
  storageKey: string;
  bridge: string;
  ostemplate: string;
  password: string;
  iso: string;
  start: boolean;
  unprivileged: boolean;
};

const defaultsFor = (type: GuestType): Omit<FormState, "node" | "vmid" | "storageKey" | "bridge"> => ({
  name: "",
  cores: type === "lxc" ? "2" : "2",
  memory: type === "lxc" ? "2048" : "4096",
  swap: "512",
  diskGiB: type === "lxc" ? "8" : "32",
  ostemplate: "",
  password: "",
  iso: "",
  start: true,
  unprivileged: true,
});

export function CreateGuestDialog({
  open,
  initialType,
  onClose,
}: {
  open: boolean;
  initialType: GuestType;
  onClose: () => void;
}) {
  const { toast, trackJob } = useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [type, setType] = useState<GuestType>(initialType);
  const [form, setForm] = useState<FormState>(() => ({
    ...defaultsFor(initialType),
    node: "",
    vmid: "",
    storageKey: "",
    bridge: "",
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [iconDraft, setIconDraft] = useState<IconDraft>({ mode: "auto" });
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const resources = useQuery({
    queryKey: ["resources"],
    queryFn: () => dataApi.resources(),
    enabled: open,
  });

  const nextId = useQuery({
    queryKey: ["clusterNextId"],
    queryFn: () => dataApi.nextId(),
    enabled: open,
  });

  const diskContent = type === "lxc" ? "rootdir" : "images";

  const diskStorages = useQuery({
    queryKey: ["mediaStorages", diskContent],
    queryFn: () => dataApi.mediaStorages(diskContent),
    enabled: open,
  });

  const templates = useQuery({
    queryKey: ["mediaTemplates"],
    queryFn: () => dataApi.mediaTemplates(),
    enabled: open && type === "lxc",
  });

  const isos = useQuery({
    queryKey: ["mediaIsos"],
    queryFn: () => dataApi.mediaIsos(),
    enabled: open && type === "qemu",
  });

  const bridges = useQuery({
    queryKey: ["nodeBridges", form.node],
    queryFn: () => dataApi.nodeBridges(form.node),
    enabled: open && Boolean(form.node),
  });

  const nodes = useMemo(() => {
    return (resources.data?.resources || [])
      .filter((r) => r.type === "node" && r.node)
      .map((r) => r.node!)
      .sort();
  }, [resources.data]);

  const nodeDiskStorages = useMemo(() => {
    const all = diskStorages.data?.storages || [];
    if (!form.node) return all;
    return all.filter((s) => s.node === form.node || s.shared);
  }, [diskStorages.data, form.node]);

  const nodeTemplates = useMemo(() => {
    return templates.data?.items || [];
  }, [templates.data]);

  const nodeIsos = useMemo(() => {
    return isos.data?.items || [];
  }, [isos.data]);

  useEffect(() => {
    if (!open) return;
    const prefs = loadCreatePrefs();
    const base = defaultsFor(initialType);
    setType(initialType);
    setForm({
      ...base,
      cores: prefs.cores || base.cores,
      memory: prefs.memory || base.memory,
      diskGiB: prefs.diskGiB || base.diskGiB,
      node: prefs.node || "",
      vmid: "",
      storageKey: prefs.storageKey || "",
      bridge: prefs.bridge || "",
    });
    setShowPassword(false);
    setShowAdvanced(false);
    setIconDraft({ mode: "auto" });
    setIconPickerOpen(false);
  }, [open, initialType]);

  useEffect(() => {
    if (!open) return;
    if (!form.node && nodes[0]) {
      const prefs = loadCreatePrefs();
      const prefer = prefs.node && nodes.includes(prefs.node) ? prefs.node : nodes[0];
      setForm((f) => ({ ...f, node: prefer }));
    }
  }, [open, nodes, form.node]);

  useEffect(() => {
    if (!open) return;
    if (!form.vmid && nextId.data?.nextid != null) {
      setForm((f) => ({ ...f, vmid: String(nextId.data!.nextid) }));
    }
  }, [open, nextId.data, form.vmid]);

  useEffect(() => {
    if (!open || !form.node) return;
    const first = nodeDiskStorages[0];
    const prefs = loadCreatePrefs();
    if (!form.storageKey) {
      if (
        prefs.storageKey &&
        nodeDiskStorages.some((s) => {
          const p = parseStorageKey(prefs.storageKey!);
          return p && s.storage === p.storage && (s.node === form.node || s.shared);
        })
      ) {
        setForm((f) => ({ ...f, storageKey: prefs.storageKey! }));
      } else if (first) {
        setForm((f) => ({
          ...f,
          storageKey: storageKey(first.node, first.storage),
        }));
      }
    } else if (form.storageKey) {
      const parsed = parseStorageKey(form.storageKey);
      const stillOk = nodeDiskStorages.some(
        (s) => s.storage === parsed?.storage && (s.node === form.node || s.shared),
      );
      if (!stillOk && first) {
        setForm((f) => ({
          ...f,
          storageKey: storageKey(first.node, first.storage),
        }));
      }
    }
  }, [open, form.node, form.storageKey, nodeDiskStorages]);

  useEffect(() => {
    if (!open) return;
    const list = bridges.data?.bridges || [];
    const prefs = loadCreatePrefs();
    const preferred =
      (prefs.bridge && list.find((b) => b.iface === prefs.bridge)) ||
      list.find((b) => b.iface === "vmbr0") ||
      list[0];
    if (!form.bridge && preferred) {
      setForm((f) => ({ ...f, bridge: preferred.iface }));
    } else if (!form.bridge && !bridges.isLoading) {
      setForm((f) => ({ ...f, bridge: prefs.bridge || "vmbr0" }));
    }
  }, [open, bridges.data, bridges.isLoading, form.bridge]);

  useEffect(() => {
    if (!open || type !== "lxc") return;
    if (!form.ostemplate && nodeTemplates[0]) {
      setForm((f) => ({ ...f, ostemplate: nodeTemplates[0].volid }));
    }
  }, [open, type, nodeTemplates, form.ostemplate]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const create = useMutation({
    mutationFn: async () => {
      const vmid = Number(form.vmid);
      const cores = Number(form.cores);
      const memory = Number(form.memory);
      const diskGiB = Number(form.diskGiB);
      const parsed = parseStorageKey(form.storageKey);
      if (!parsed) throw new Error("Select a disk storage.");
      if (!form.node) throw new Error("Select a node.");
      if (!form.name.trim()) throw new Error("Name is required.");

      let created: {
        ok: boolean;
        upid?: string;
        type: "lxc" | "qemu";
        node: string;
        vmid: number;
      };

      if (type === "lxc") {
        created = await dataApi.createGuest({
          type: "lxc",
          node: form.node,
          vmid,
          name: form.name.trim(),
          cores,
          memory,
          swap: Number(form.swap) || 0,
          diskGiB,
          storage: parsed.storage,
          bridge: form.bridge || "vmbr0",
          ostemplate: form.ostemplate,
          password: form.password,
          unprivileged: form.unprivileged,
          start: form.start,
        });
      } else {
        created = await dataApi.createGuest({
          type: "qemu",
          node: form.node,
          vmid,
          name: form.name.trim(),
          cores,
          memory,
          diskGiB,
          storage: parsed.storage,
          bridge: form.bridge || "vmbr0",
          iso: form.iso || null,
          start: form.start,
        });
      }

      try {
        const iconBody = await persistIconDraft(
          iconDraft,
          form.name.trim(),
          (file) => dataApi.uploadGuestIcon(file),
        );
        if (iconBody && iconBody !== "clear") {
          await dataApi.setGuestIcon(created.node, created.type, created.vmid, iconBody);
        }
      } catch {
        /* guest created — icon is optional */
      }

      return created;
    },
    onSuccess: (data) => {
      saveCreatePrefs({
        node: form.node,
        storageKey: form.storageKey,
        bridge: form.bridge,
        cores: form.cores,
        memory: form.memory,
        diskGiB: form.diskGiB,
      });
      const label = form.name.trim() || `Guest ${data.vmid}`;
      trackJob({
        kind: "create",
        title: `Create · ${label}`,
        detail: `${data.type === "lxc" ? "CT" : "VM"} ${data.vmid} on ${data.node}`,
        node: data.node,
        upid: data.upid || "",
        vmid: String(data.vmid),
      });
      toast(
        "ok",
        data.type === "lxc"
          ? "Container create started — Proxmox is setting it up."
          : "VM create started — Proxmox is setting it up.",
      );
      void qc.invalidateQueries({ queryKey: ["resources"] });
      void qc.invalidateQueries({ queryKey: ["clusterNextId"] });
      void qc.invalidateQueries({ queryKey: ["guestIcons"] });
      onClose();
      navigate(`/guest/${data.type}/${encodeURIComponent(data.node)}/${data.vmid}`);
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const iconPreview = resolveIconSrc(iconDraft, form.name);

  if (!open) return null;

  const busy = create.isPending;
  const title = type === "lxc" ? "New container" : "New virtual machine";
  const subtitle =
    type === "lxc"
      ? "Create an LXC with the usual defaults — tweak only what you need."
      : "Create a VM with disk, network, and optional install ISO.";

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function switchType(next: GuestType) {
    if (next === type) return;
    setType(next);
    setForm((f) => ({
      ...f,
      ...defaultsFor(next),
      storageKey: "",
      ostemplate: "",
      iso: "",
      password: "",
    }));
    setIconDraft({ mode: "auto" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <div className="flex h-[min(92dvh,880px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40 sm:min-h-0 sm:min-w-0"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-bg p-1">
            <TypeTab active={type === "lxc"} onClick={() => switchType("lxc")} disabled={busy}>
              Container
            </TypeTab>
            <TypeTab active={type === "qemu"} onClick={() => switchType("qemu")} disabled={busy}>
              Virtual machine
            </TypeTab>
          </div>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <Section icon={<Server className="size-3.5" />} title="Placement">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Node">
                  <select
                    value={form.node}
                    disabled={busy || resources.isLoading}
                    onChange={(e) => patch("node", e.target.value)}
                    className={inputClass}
                    required
                  >
                    {nodes.length === 0 ? <option value="">No nodes</option> : null}
                    {nodes.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="VMID">
                  <input
                    type="number"
                    min={100}
                    value={form.vmid}
                    disabled={busy}
                    onChange={(e) => patch("vmid", e.target.value)}
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label={type === "lxc" ? "Hostname" : "Name"} className="sm:col-span-2">
                  <input
                    value={form.name}
                    disabled={busy}
                    onChange={(e) => patch("name", e.target.value)}
                    placeholder={type === "lxc" ? "nextcloud" : "ubuntu-desktop"}
                    className={inputClass}
                    required
                    autoFocus
                  />
                </Field>
              </div>
            </Section>

            <Section
              icon={<HardDrive className="size-3.5" />}
              title={type === "lxc" ? "Template & disk" : "Disk & install media"}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {type === "lxc" ? (
                  <Field label="OS template" className="sm:col-span-2">
                    <select
                      value={form.ostemplate}
                      disabled={busy || templates.isLoading}
                      onChange={(e) => patch("ostemplate", e.target.value)}
                      className={inputClass}
                      required
                    >
                      <option value="">
                        {templates.isLoading ? "Loading…" : "— select template —"}
                      </option>
                      {nodeTemplates.map((t) => (
                        <option key={`${t.node}:${t.volid}`} value={t.volid}>
                          {volname(t.volid)} ({t.storage})
                        </option>
                      ))}
                    </select>
                    {!templates.isLoading && nodeTemplates.length === 0 ? (
                      <Hint>
                        No templates on storage. Download one from Media → Catalog first.
                      </Hint>
                    ) : null}
                  </Field>
                ) : (
                  <Field label="Install ISO (optional)" className="sm:col-span-2">
                    <select
                      value={form.iso}
                      disabled={busy || isos.isLoading}
                      onChange={(e) => patch("iso", e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— none / attach later —</option>
                      {nodeIsos.map((t) => (
                        <option key={`${t.node}:${t.volid}`} value={t.volid}>
                          {volname(t.volid)} ({t.storage})
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <Field label="Disk storage">
                  <select
                    value={form.storageKey}
                    disabled={busy || diskStorages.isLoading}
                    onChange={(e) => patch("storageKey", e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="">— select —</option>
                    {nodeDiskStorages.map((s) => (
                      <option key={storageKey(s.node, s.storage)} value={storageKey(s.node, s.storage)}>
                        {s.storage}
                        {s.shared ? " (shared)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Disk size (GiB)">
                  <input
                    type="number"
                    min={1}
                    max={1024}
                    value={form.diskGiB}
                    disabled={busy}
                    onChange={(e) => patch("diskGiB", e.target.value)}
                    className={inputClass}
                    required
                  />
                </Field>
              </div>
            </Section>

            {type === "lxc" ? (
              <Section icon={<Box className="size-3.5" />} title="Access">
                <Field label="Root password">
                  <div className="flex gap-2">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      disabled={busy}
                      onChange={(e) => patch("password", e.target.value)}
                      className={`${inputClass} flex-1`}
                      required
                      minLength={5}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setShowPassword((v) => !v)}
                      className="shrink-0 rounded-xl border border-line px-3 text-sm hover:bg-surface-2"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const pw = randomPassword();
                        patch("password", pw);
                        setShowPassword(true);
                      }}
                      className="shrink-0 rounded-xl border border-line px-3 text-sm hover:bg-surface-2"
                    >
                      Generate
                    </button>
                  </div>
                </Field>
              </Section>
            ) : null}

            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={form.start}
                disabled={busy}
                onChange={(e) => patch("start", e.target.checked)}
                className="accent-accent"
              />
              Start after create
            </label>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full rounded-xl border border-dashed border-line px-3 py-2 text-left text-sm text-muted hover:border-line-2 hover:text-ink"
            >
              {showAdvanced ? "Hide advanced options" : "Show advanced options"}
              <span className="mt-0.5 block text-[11px] text-muted">
                Logo, CPU/RAM, network, and LXC privilege
              </span>
            </button>

            {showAdvanced ? (
              <>
                <Section icon={<ImagePlus className="size-3.5" />} title="Logo">
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-bg/50 p-3">
                    <LogoPreview src={iconPreview.src} className="size-14" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{iconPreview.label}</p>
                      <p className="text-xs text-muted">{iconPreview.hint}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setIconPickerOpen(true)}
                      className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2"
                    >
                      Change
                    </button>
                  </div>
                </Section>

                <Section icon={<Cpu className="size-3.5" />} title="Resources">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="CPU cores">
                      <input
                        type="number"
                        min={1}
                        max={128}
                        value={form.cores}
                        disabled={busy}
                        onChange={(e) => patch("cores", e.target.value)}
                        className={inputClass}
                        required
                      />
                    </Field>
                    <Field label="Memory (MiB)">
                      <input
                        type="number"
                        min={16}
                        value={form.memory}
                        disabled={busy}
                        onChange={(e) => patch("memory", e.target.value)}
                        className={inputClass}
                        required
                      />
                    </Field>
                    {type === "lxc" ? (
                      <Field label="Swap (MiB)">
                        <input
                          type="number"
                          min={0}
                          value={form.swap}
                          disabled={busy}
                          onChange={(e) => patch("swap", e.target.value)}
                          className={inputClass}
                        />
                      </Field>
                    ) : (
                      <div className="hidden sm:block" />
                    )}
                  </div>
                </Section>

                <Section icon={<Network className="size-3.5" />} title="Network">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Bridge">
                      <select
                        value={form.bridge}
                        disabled={busy || bridges.isLoading}
                        onChange={(e) => patch("bridge", e.target.value)}
                        className={inputClass}
                        required
                      >
                        {(bridges.data?.bridges || []).length === 0 ? (
                          <option value={form.bridge || "vmbr0"}>
                            {form.bridge || "vmbr0"}
                          </option>
                        ) : (
                          bridges.data!.bridges.map((b) => (
                            <option key={b.iface} value={b.iface}>
                              {b.iface}
                              {!b.active ? " (inactive)" : ""}
                            </option>
                          ))
                        )}
                      </select>
                    </Field>
                    <Field label="IP">
                      <input value="DHCP" disabled className={`${inputClass} opacity-70`} />
                    </Field>
                  </div>
                </Section>

                {type === "lxc" ? (
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={form.unprivileged}
                      disabled={busy}
                      onChange={(e) => patch("unprivileged", e.target.checked)}
                      className="accent-accent"
                    />
                    Unprivileged container (recommended)
                  </label>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-surface-2 disabled:opacity-40 sm:min-h-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0"
            >
              {busy
                ? "Creating…"
                : type === "lxc"
                  ? "Create container"
                  : "Create VM"}
            </button>
          </div>
        </form>
      </div>

      <GuestIconPicker
        open={iconPickerOpen}
        name={form.name}
        value={iconDraft}
        onChange={setIconDraft}
        onClose={() => setIconPickerOpen(false)}
        title="Choose a logo"
        doneLabel="Use this logo"
      />
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-accent disabled:opacity-50 md:text-sm";

function TypeTab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-40 ${
        active
          ? "bg-surface text-ink shadow-sm"
          : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-accent/15 text-accent">
          {icon}
        </span>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-muted">{children}</p>;
}
