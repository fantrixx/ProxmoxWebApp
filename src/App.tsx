import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "./api";
import { AppProvider } from "./context";
import Login from "./pages/Login";
import AppShell from "./pages/AppShell";
import Dashboard from "./pages/Dashboard";
import GuestList from "./pages/GuestList";
import GuestDetail from "./pages/GuestDetail";
import StoragePage from "./pages/Storage";
import ConsolePage from "./pages/ConsolePage";

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
  );
}
