import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { dataApi } from "../api";
import { Header } from "../components/Header";
import { formatBytes, formatSnapTime } from "../format";
import type { MediaItem } from "../types";

type Tab = "isos" | "templates";

function volname(volid: string): string {
  const idx = volid.indexOf(":");
  return idx >= 0 ? volid.slice(idx + 1) : volid;
}

function MediaTable({ items, note }: { items: MediaItem[]; note?: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">Nothing found.</p>;
  }

  return (
    <div className="space-y-3">
      {note ? <p className="text-sm text-muted">{note}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Volume</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Storage</th>
              <th className="px-4 py-3 font-medium">Node</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item) => (
              <tr key={`${item.node}:${item.volid}`} className="hover:bg-surface-2/40">
                <td className="max-w-xs truncate px-4 py-3 font-mono text-xs">
                  {volname(item.volid)}
                </td>
                <td className="px-4 py-3 text-muted">{formatBytes(item.size)}</td>
                <td className="px-4 py-3 text-muted">{item.storage}</td>
                <td className="px-4 py-3 text-muted">{item.node}</td>
                <td className="hidden px-4 py-3 text-muted sm:table-cell">
                  {formatSnapTime(item.ctime)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MediaPage() {
  const [tab, setTab] = useState<Tab>("isos");

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

  const active = tab === "isos" ? isos : templates;
  const items = tab === "isos" ? isos.data?.items || [] : templates.data?.items || [];

  return (
    <div>
      <Header
        title="Media"
        subtitle={tab === "isos" ? "ISO images" : "Container templates"}
      />
      <div className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <div className="flex gap-2">
          <TabBtn active={tab === "isos"} onClick={() => setTab("isos")}>
            ISOs
          </TabBtn>
          <TabBtn active={tab === "templates"} onClick={() => setTab("templates")}>
            CT Templates
          </TabBtn>
        </div>

        {active.isError ? (
          <p className="text-sm text-bad">{(active.error as Error).message}</p>
        ) : active.isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <MediaTable
            items={items}
            note={
              tab === "isos"
                ? "Attach ISOs from a VM's detail page (CD/DVD panel)."
                : undefined
            }
          />
        )}
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
