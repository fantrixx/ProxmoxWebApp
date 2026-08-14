import { lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";
import { MobileTabBar, Sidebar } from "../components/Sidebar";
import { Toasts } from "../components/Toasts";
import { useApp } from "../context";

const TerminalModal = lazy(() =>
  import("../components/TerminalModal").then((m) => ({ default: m.TerminalModal })),
);

export default function AppShell() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg md:flex-row">
      <Sidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <Outlet />
      </main>
      <MobileTabBar />
      <ConsoleHost />
      <Toasts />
    </div>
  );
}

function ConsoleHost() {
  const { consoleTarget } = useApp();
  if (!consoleTarget) return null;
  return (
    <Suspense fallback={null}>
      <TerminalModal />
    </Suspense>
  );
}
