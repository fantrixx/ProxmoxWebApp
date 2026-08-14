import { lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { Toasts } from "../components/Toasts";
import { useApp } from "../context";

const TerminalModal = lazy(() =>
  import("../components/TerminalModal").then((m) => ({ default: m.TerminalModal })),
);

export default function AppShell() {
  return (
    <div className="flex min-h-dvh bg-bg">
      <Sidebar />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
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
