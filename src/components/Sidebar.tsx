import { Link, useLocation } from "react-router-dom";
import {
  Box,
  Cpu,
  Disc3,
  HardDrive,
  LayoutDashboard,
  ListTodo,
  MonitorSmartphone,
} from "lucide-react";
import { AppVersionLabel } from "./AppVersion";

const desktopItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/containers", label: "Containers", icon: Box },
  { to: "/vms", label: "VMs", icon: MonitorSmartphone },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/media", label: "Media", icon: Disc3 },
  { to: "/storage", label: "Storage", icon: HardDrive },
];

const mobileItems = desktopItems.filter((item) => item.to !== "/storage");

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
      <div className="space-y-1 px-5 py-4 text-[11px] text-muted">
        <p>Live data every 3 seconds</p>
        <p className="font-mono">
          <AppVersionLabel showCommit />
        </p>
      </div>
    </aside>
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
