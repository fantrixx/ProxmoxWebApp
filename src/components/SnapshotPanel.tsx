import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { dataApi } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatSnapTime } from "../format";
import { useApp } from "../context";
import type { GuestType, Snapshot } from "../types";

export function SnapshotPanel({
  node,
  type,
  vmid,
}: {
  node: string;
  type: GuestType;
  vmid: string;
}) {
  const { toast } = useApp();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vmstate, setVmstate] = useState(false);
  const [pending, setPending] = useState<
    null | { kind: "rollback" | "delete"; snap: Snapshot }
  >(null);

  const list = useQuery({
    queryKey: ["snapshots", node, type, vmid],
    queryFn: () => dataApi.snapshots(node, type, vmid),
  });

  const snapshots = (list.data?.snapshots || []).filter((s) => s.name !== "current");

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["snapshots", node, type, vmid] });
    void qc.invalidateQueries({ queryKey: ["guest", node, type, vmid] });
    void qc.invalidateQueries({ queryKey: ["resources"] });
  }

  const create = useMutation({
    mutationFn: () =>
      dataApi.createSnapshot(node, type, vmid, {
        snapname: name.trim(),
        description: description.trim() || undefined,
        vmstate: type === "qemu" ? vmstate : undefined,
      }),
    onSuccess: () => {
      toast("ok", "Snapshot erstellt.");
      setName("");
      setDescription("");
      setVmstate(false);
      invalidate();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const rollback = useMutation({
    mutationFn: (snapname: string) =>
      dataApi.rollbackSnapshot(node, type, vmid, snapname),
    onSuccess: () => {
      toast("ok", "Snapshot wiederhergestellt.");
      setPending(null);
      invalidate();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const remove = useMutation({
    mutationFn: (snapname: string) =>
      dataApi.deleteSnapshot(node, type, vmid, snapname),
    onSuccess: () => {
      toast("ok", "Snapshot gelöscht.");
      setPending(null);
      invalidate();
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const busy = create.isPending || rollback.isPending || remove.isPending;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-sm font-medium text-muted">Snapshots</h2>

      <form
        className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label>
          <span className="mb-1 block text-[11px] text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="vor-update"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-accent md:text-sm"
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] text-muted">Beschreibung</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="optional"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-accent md:text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="min-h-11 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0 sm:py-2"
        >
          {create.isPending ? "Erstelle…" : "Anlegen"}
        </button>
        {type === "qemu" ? (
          <label className="sm:col-span-3 flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={vmstate}
              onChange={(e) => setVmstate(e.target.checked)}
              className="accent-accent"
            />
            RAM-Zustand mitspeichern
          </label>
        ) : null}
      </form>

      {list.isError ? (
        <p className="text-sm text-bad">{(list.error as Error).message}</p>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Snapshots.</p>
      ) : (
        <ul className="divide-y divide-line">
          {snapshots.map((snap) => (
            <li key={snap.name} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{snap.name}</div>
                <div className="text-xs text-muted">
                  {formatSnapTime(snap.snaptime)}
                  {snap.description ? ` · ${snap.description}` : ""}
                  {snap.vmstate ? " · inkl. RAM" : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending({ kind: "rollback", snap })}
                className="min-h-11 flex-1 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface-2 disabled:opacity-40 sm:min-h-0 sm:flex-none sm:py-1.5"
              >
                Zurückrollen
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending({ kind: "delete", snap })}
                className="min-h-11 flex-1 rounded-lg border border-bad/40 px-2.5 py-2 text-xs text-bad hover:bg-bad/10 disabled:opacity-40 sm:min-h-0 sm:flex-none sm:py-1.5"
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending?.kind === "rollback" ? (
        <ConfirmDialog
          title={`Auf „${pending.snap.name}“ zurückrollen?`}
          body="Der aktuelle Zustand des Gastes wird durch diesen Snapshot ersetzt. Ungespeicherte Änderungen gehen verloren."
          confirmLabel="Zurückrollen"
          danger
          busy={rollback.isPending}
          onCancel={() => setPending(null)}
          onConfirm={() => rollback.mutate(pending.snap.name)}
        />
      ) : null}
      {pending?.kind === "delete" ? (
        <ConfirmDialog
          title={`Snapshot „${pending.snap.name}“ löschen?`}
          body="Der Snapshot wird unwiderruflich entfernt. Der laufende Gast bleibt unverändert."
          confirmLabel="Löschen"
          danger
          busy={remove.isPending}
          onCancel={() => setPending(null)}
          onConfirm={() => remove.mutate(pending.snap.name)}
        />
      ) : null}
    </section>
  );
}
