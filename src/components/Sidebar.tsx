import { Link, useLocation } from "react-router-dom";
import {
  Box,
  Cpu,
  HardDrive,
  LayoutDashboard,
  MonitorSmartphone,
} from "lucide-react";

const items = [
  { to: "/", label: "Übersicht", icon: LayoutDashboard, exact: true },
  { to: "/containers", label: "Container", icon: Box },
  { to: "/vms", label: "VMs", icon: MonitorSmartphone },
  { to: "/storage", label: "Speicher", icon: HardDrive },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-bg-2">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-xl bg-accent text-black">
          <Cpu className="size-5" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">ProxPanel</div>
          <div className="text-[11px] text-muted">Proxmox Verwaltung</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.to
            : pathname.startsWith(item.to);
          const Icon = item.icon;
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
      <p className="px-5 py-4 text-[11px] text-muted">Live-Daten alle 3 Sekunden</p>
    </aside>
  );
}
