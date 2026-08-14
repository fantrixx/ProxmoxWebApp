import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { dataApi } from "../api";
import { useApp } from "../context";

function volname(volid: string): string {
  const idx = volid.indexOf(":");
  return idx >= 0 ? volid.slice(idx + 1) : volid;
}

function findCdrom(config: Record<string, unknown>): { drive: string; value: string } | null {
  for (const [key, value] of Object.entries(config)) {
    if (!/^(ide|sata|scsi)\d+$/i.test(key)) continue;
    const str = String(value);
    if (str.includes("media=cdrom") || str.includes(".iso")) {
      return { drive: key, value: str };
    }
  }
  return null;
}

function isoFromDrive(value: string): string | null {
  if (value.startsWith("none")) return null;
  const part = value.split(",")[0];
  return part.includes(".iso") ? part : null;
}

export function CdromPanel({
  node,
  vmid,
  config,
}: {
  node: string;
  vmid: string;
  config: Record<string, unknown>;
}) {
  const { toast } = useApp();
  const qc = useQueryClient();
  const cdrom = findCdrom(config);
  const currentIso = cdrom ? isoFromDrive(cdrom.value) : null;
  const [selected, setSelected] = useState(currentIso || "");

  const isos = useQuery({
    queryKey: ["mediaIsos"],
    queryFn: () => dataApi.mediaIsos(),
  });

  const options = useMemo(() => isos.data?.items || [], [isos.data]);

  const apply = useMutation({
    mutationFn: (volid: string | null) =>
      dataApi.setCdrom(node, vmid, {
        volid,
        ide: cdrom?.drive,
      }),
    onSuccess: () => {
      toast("ok", "CD/DVD updated.");
      void qc.invalidateQueries({ queryKey: ["guest", node, "qemu", vmid] });
    },
    onError: (err: Error) => toast("err", err.message),
  });

  const busy = apply.isPending;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-sm font-medium text-muted">CD / DVD</h2>

      <p className="mb-4 text-sm text-muted">
        Drive:{" "}
        <span className="font-mono text-ink">
          {cdrom?.drive || "ide2 (default)"}
        </span>
        {" · "}
        Current:{" "}
        <span className="font-mono text-ink">
          {currentIso ? volname(currentIso) : "empty"}
        </span>
      </p>

      {isos.isError ? (
        <p className="text-sm text-bad">{(isos.error as Error).message}</p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] text-muted">ISO image</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={isos.isLoading || busy}
              className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-accent md:text-sm"
            >
              <option value="">— select ISO —</option>
              {options.map((item) => (
                <option key={item.volid} value={item.volid}>
                  {volname(item.volid)} ({item.storage} · {item.node})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !selected}
            onClick={() => apply.mutate(selected)}
            className="min-h-11 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40 sm:min-h-0 sm:py-2"
          >
            {apply.isPending ? "Applying…" : "Apply"}
          </button>
          <button
            type="button"
            disabled={busy || !currentIso}
            onClick={() => apply.mutate(null)}
            className="min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-surface-2 disabled:opacity-40 sm:min-h-0 sm:py-2"
          >
            Eject
          </button>
        </div>
      )}
    </section>
  );
}
