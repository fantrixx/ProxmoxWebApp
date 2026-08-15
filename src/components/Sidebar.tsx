import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Cpu,
  Disc3,
  HardDrive,
  HardDriveDownload,
  LayoutDashboard,
  ListTodo,
} from "lucide-react";
import { AppVersionLabel } from "./AppVersion";
import { useResources } from "../hooks";
import { cpuPct, formatBytes, formatUptime, usagePct } from "../format";
import type { ClusterResource } from "../types";

const desktopItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/backups", label: "Backups", icon: HardDriveDownload },
  { to: "/storage", label: "Storage", icon: HardDrive },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/media", label: "Media", icon: Disc3 },
];

const mobileItems = desktopItems;

function isActive(pathname: string, item: (typeof desktopItems)[number]) {
  return item.exact ? pathname === item.to : pathname.startsWith(item.to);
}

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-bg-2 md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-xl bg-accent text-black">
          <Cpu className="size-5" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">ProxPanel</div>
          <div className="text-[11px] text-muted">
            Proxmox admin · <AppVersionLabel />
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {desktopItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-surface text-ink"
                  : "text-muted hover:bg-surface/60 hover:text-ink"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-3 py-3">
        <SidebarNodes />
        <SidebarGuests />
        <div className="mt-3 space-y-0.5 px-2 text-[11px] text-muted">
          <p>Live data every 3 seconds</p>
          <p className="font-mono">
            <AppVersionLabel showCommit />
          </p>
        </div>
      </div>
    </aside>
  );
}

function SidebarNodes() {
  const q = useResources();
  const nodes = (q.data?.resources || []).filter((r) => r.type === "node");

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Nodes
        </p>
        {nodes.length > 0 ? (
          <span className="text-[11px] text-muted">{nodes.length}</span>
        ) : null}
      </div>
      {q.isLoading && !nodes.length ? (
        <p className="px-2 text-[11px] text-muted">Loading…</p>
      ) : nodes.length === 0 ? (
        <p className="px-2 text-[11px] text-muted">No nodes</p>
      ) : (
        <ul className="max-h-48 space-y-2 overflow-y-auto pr-0.5">
          {nodes.map((node) => (
            <SidebarNodeRow key={node.id} node={node} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SidebarGuests() {
  const q = useResources();
  const navigate = useNavigate();
  const guests = (q.data?.resources || []).filter(
    (r) => (r.type === "lxc" || r.type === "qemu") && !r.template,
  );
  const running = guests.filter((g) => g.status === "running").length;
  const total = guests.length;
  const loading = q.isLoading && !q.data;

  return (
    <div className="mt-3 border-t border-line/80 pt-3">
      <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted">
        Guests
      </p>
      <button
        type="button"
        onClick={() => navigate("/?running=1")}
        title="Show running guests on Overview"
        className="flex w-full items-center gap-3 rounded-xl border border-line/80 bg-surface/50 px-2.5 py-2 text-left transition hover:border-line-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="min-w-0">
          <span className="block text-lg font-semibold tabular-nums text-good leading-none">
            {loading ? "—" : running}
          </span>
          <span className="mt-0.5 block text-[10px] text-good/80">running</span>
        </span>
        <span className="h-8 w-px shrink-0 bg-line" aria-hidden />
        <span className="min-w-0">
          <span className="block text-base font-semibold tabular-nums text-ink/90 leading-none">
            {loading ? "—" : total}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted">total</span>
        </span>
      </button>
    </div>
  );
}

function SidebarNodeRow({ node }: { node: ClusterResource }) {
  const online = node.status !== "unknown" && node.status !== "offline";
  const cpu = cpuPct(node.cpu);
  const ram = usagePct(node.mem, node.maxmem);

  return (
    <li className="rounded-xl border border-line/80 bg-surface/50 px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              online ? "bg-good" : "bg-bad"
            }`}
            aria-hidden
          />
          <span className="truncate text-xs font-medium">{node.node}</span>
        </div>
        <span className="shrink-0 text-[10px] text-muted">
          {formatUptime(node.uptime)}
        </span>
      </div>
      <MiniBar label="CPU" percent={cpu} detail={`${cpu.toFixed(0)}%`} />
      <MiniBar
        label="RAM"
        percent={ram}
        detail={formatBytes(node.mem)}
        className="mt-1"
      />
    </li>
  );
}

function MiniBar({
  label,
  percent,
  detail,
  className = "",
}: {
  label: string;
  percent: number;
  detail: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const tone =
    clamped >= 90 ? "bg-bad" : clamped >= 75 ? "bg-warn" : "bg-good";

  return (
    <div className={className}>
      <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[10px]">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-ink/80">{detail}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-bg">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function MobileTabBar() {
  const { pathname } = useLocation();

  return (
    <nav className="shrink-0 border-t border-line bg-bg-2 pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid grid-cols-5">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
