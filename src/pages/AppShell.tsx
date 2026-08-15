import { Outlet } from "react-router-dom";
import { ClusterStatusBar } from "../components/ClusterStatusBar";
import { MobileTabBar, Sidebar } from "../components/Sidebar";
import { Toasts } from "../components/Toasts";
import { useApp } from "../context";

function ToastStack() {
  const { toasts } = useApp();
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[22rem]">
      <Toasts />
    </div>
  );
}

export default function AppShell() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg md:flex-row">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ClusterStatusBar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
      <ToastStack />
    </div>
  );
}
