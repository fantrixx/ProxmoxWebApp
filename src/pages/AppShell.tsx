import { Outlet } from "react-router-dom";
import { MobileTabBar, Sidebar } from "../components/Sidebar";
import { Toasts } from "../components/Toasts";

export default function AppShell() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg md:flex-row">
      <Sidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <Outlet />
      </main>
      <MobileTabBar />
      <Toasts />
    </div>
  );
}
