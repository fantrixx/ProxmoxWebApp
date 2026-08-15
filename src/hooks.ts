import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataApi } from "./api";
import type { ClusterResource, GuestRates } from "./types";
import { useApp } from "./context";
import { setPendingGuestAction } from "./pendingGuest";

/**
 * Extra bottom inset when mobile browser chrome (e.g. Safari toolbar)
 * covers the bottom of the layout viewport.
 */
export function useBottomChromeInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const sync = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setInset(0);
        return;
      }
      const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset(covered);
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return inset;
}

export function useGuestRates(resources: ClusterResource[] | undefined) {
  const [rates, setRates] = useState<Map<string, GuestRates>>(() => new Map());
  const prev = useRef(
    new Map<
      string,
      { t: number; netin: number; netout: number; diskread: number; diskwrite: number }
    >(),
  );

  useEffect(() => {
    if (!resources) return;
    const now = Date.now();
    const next = new Map<string, GuestRates>();
    for (const r of resources) {
      if (r.type !== "lxc" && r.type !== "qemu") continue;
      const sample = {
        t: now,
        netin: r.netin || 0,
        netout: r.netout || 0,
        diskread: r.diskread || 0,
        diskwrite: r.diskwrite || 0,
      };
      const last = prev.current.get(r.id);
      if (last && now - last.t >= 900) {
        const dt = (now - last.t) / 1000;
        next.set(r.id, {
          netin: Math.max(0, (sample.netin - last.netin) / dt),
          netout: Math.max(0, (sample.netout - last.netout) / dt),
          diskread: Math.max(0, (sample.diskread - last.diskread) / dt),
          diskwrite: Math.max(0, (sample.diskwrite - last.diskwrite) / dt),
        });
        prev.current.set(r.id, sample);
      } else if (!last) {
        prev.current.set(r.id, sample);
      }
    }
    if (next.size) setRates(next);
  }, [resources]);

  return rates;
}

export function useResources() {
  return useQuery({
    queryKey: ["resources"],
    queryFn: dataApi.resources,
    refetchInterval: 3000,
  });
}

export function useGuestAction() {
  const qc = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({
      node,
      type,
      vmid,
      action,
    }: {
      node: string;
      type: string;
      vmid: number;
      action: string;
    }) => dataApi.action(node, type, vmid, action),
    onSuccess: (_data, vars) => {
      setPendingGuestAction(vars.node, vars.type, vars.vmid, vars.action);
      const labels: Record<string, string> = {
        start: "start requested.",
        stop: "force stop requested.",
        shutdown: "shutdown requested.",
        reboot: "reboot requested.",
      };
      toast("ok", `Guest ${labels[vars.action] || vars.action}`);
      void qc.invalidateQueries({ queryKey: ["resources"] });
      void qc.invalidateQueries({ queryKey: ["guest"] });
    },
    onError: (err: Error) => {
      toast("err", err.message);
    },
  });
}
