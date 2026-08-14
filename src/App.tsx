import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "./api";
import { AppProvider } from "./context";
import Login from "./pages/Login";
import AppShell from "./pages/AppShell";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const GuestList = lazy(() => import("./pages/GuestList"));
const GuestDetail = lazy(() => import("./pages/GuestDetail"));
const StoragePage = lazy(() => import("./pages/Storage"));
const ConsolePage = lazy(() => import("./pages/ConsolePage"));

function PageFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted">
      Loading…
    </div>
  );
}

function Protected() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
  });

  if (me.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-muted">
        Checking connection…
      </div>
    );
  }

  if (me.isError) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppProvider user={me.data!}>
      <Outlet />
    </AppProvider>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected />}>
          <Route path="console/:type/:node/:vmid" element={<ConsolePage />} />
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="containers" element={<GuestList kind="lxc" />} />
            <Route path="vms" element={<GuestList kind="qemu" />} />
            <Route path="storage" element={<StoragePage />} />
            <Route path="guest/:type/:node/:vmid" element={<GuestDetail />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
