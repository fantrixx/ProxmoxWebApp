import { Outlet } from "react-router-dom";
import { MobileTabBar, Sidebar } from "../components/Sidebar";
import { Toasts } from "../components/Toasts";
import { useApp } from "../context";
import { useBottomChromeInset } from "../hooks";

function ToastStack() {
  const { toasts } = useApp();
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(5.75rem+var(--prox-chrome-inset,0px)+env(safe-area-inset-bottom,0px))] z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[22rem]">
      <Toasts />
    </div>
  );
}

export default function AppShell() {
  const chromeInset = useBottomChromeInset();

  return (
    <div
      className="flex h-svh max-h-svh flex-col overflow-hidden bg-bg md:h-dvh md:max-h-none md:flex-row"
      style={{ ["--prox-chrome-inset" as string]: `${chromeInset}px` }}
    >
      <Sidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <Outlet />
      </main>
      <MobileTabBar />
      <ToastStack />
    </div>
  );
}
