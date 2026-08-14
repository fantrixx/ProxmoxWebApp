import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataApi } from "../api";
import { useApp } from "../context";
import type { GuestType } from "../types";

export function ResourceEditor({
  node,
  type,
  vmid,
  config,
}: {
  node: string;
  type: GuestType;
  vmid: string;
  config: Record<string, unknown>;
}) {
  const { toast } = useApp();
  const qc = useQueryClient();
  const [cores, setCores] = useState(1);
  const [memory, setMemory] = useState(512);
  const [swap, setSwap] = useState(0);
  const [growGiB, setGrowGiB] = useState(0);

  const digest = String(config.digest || "");

  useEffect(() => {
    setCores(Number(config.cores || 1));
    setMemory(Number(config.memory || 512));
    setSwap(Number(config.swap || 0));
    setGrowGiB(0);
  }, [digest, config.cores, config.memory, config.swap]);

  const save = useMutation({
    mutationFn: () =>
      dataApi.updateResources(node, type, vmid, {
        cores,
        memory,
        swap: type === "lxc" ? swap : undefined,
        digest: digest || undefined,
        growGiB: growGiB > 0 ? growGiB : undefined,
      }),
    onSuccess: () => {
      toast("ok", "Ressourcen aktualisiert.");
      setGrowGiB(0);
      void qc.invalidateQueries({ queryKey: ["guest", node, type, vmid] });
      void qc.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (err: Error) => toast("err", err.message),
  });

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-1 text-sm font-medium text-muted">Ressourcen</h2>
      <p className="mb-4 text-xs text-muted">
        CPU und RAM lassen sich oft im laufenden Betrieb ändern. Die Festplatte kann nur vergrößert werden.
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label>
          <span className="mb-1 block text-[11px] text-muted">CPU-Kerne</span>
          <input
            type="number"
            min={1}
            max={128}
            value={cores}
            onChange={(e) => setCores(Number(e.target.value))}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] text-muted">RAM (MiB)</span>
          <input
            type="number"
            min={16}
            max={524288}
            step={16}
            value={memory}
            onChange={(e) => setMemory(Number(e.target.value))}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        {type === "lxc" ? (
          <label>
            <span className="mb-1 block text-[11px] text-muted">Swap (MiB)</span>
            <input
              type="number"
              min={0}
              max={524288}
              step={16}
              value={swap}
              onChange={(e) => setSwap(Number(e.target.value))}
              className="w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
          </label>
        ) : (
          <div />
        )}
        <label>
          <span className="mb-1 block text-[11px] text-muted">Disk + GiB</span>
          <input
            type="number"
            min={0}
            max={1024}
            value={growGiB}
            onChange={(e) => setGrowGiB(Number(e.target.value))}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-2 disabled:opacity-40"
          >
            {save.isPending ? "Speichere…" : "Übernehmen"}
          </button>
        </div>
      </form>
    </section>
  );
}
