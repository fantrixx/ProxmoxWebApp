import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "./api";
import { AppProvider } from "./context";
import Login from "./pages/Login";
import AppShell from "./pages/AppShell";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const GuestDetail = lazy(() => import("./pages/GuestDetail"));
const StoragePage = lazy(() => import("./pages/Storage"));
const TasksPage = lazy(() => import("./pages/Tasks"));
const MediaPage = lazy(() => import("./pages/Media"));
const BackupsPage = lazy(() => import("./pages/Backups"));
const MarketplacePage = lazy(() => import("./pages/Marketplace"));
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
          <Route path="console/node/:node" element={<ConsolePage />} />
          <Route path="console/:type/:node/:vmid" element={<ConsolePage />} />
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="containers" element={<Navigate to="/" replace />} />
            <Route path="vms" element={<Navigate to="/" replace />} />
            <Route path="marketplace" element={<MarketplacePage />} />
            <Route path="storage" element={<StoragePage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="backups" element={<BackupsPage />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="guest/:type/:node/:vmid" element={<GuestDetail />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
