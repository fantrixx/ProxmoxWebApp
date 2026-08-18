import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api";
import { useApp } from "../context";
import { ActiveJobsBanner } from "./ActiveJobs";
import { AppVersionLabel } from "./AppVersion";
import { GlobalSearch } from "./GlobalSearch";
import { HeaderUpdateButton, UpdateBanner } from "./UpdateBanner";

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { user } = useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function logout() {
    await authApi.logout().catch(() => undefined);
    qc.clear();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-4 py-2 md:gap-4 md:px-8 md:py-5">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight md:text-xl">{title}</h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] text-muted md:text-sm">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
          <GlobalSearch />
          <div className="hidden text-right sm:block">
            <div className="max-w-32 truncate text-sm md:max-w-none">{user.username}</div>
            <div className="hidden max-w-56 truncate font-mono text-[11px] text-muted md:block">
              {user.host.replace(/^https?:\/\//, "")}
            </div>
          </div>
          <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted md:rounded-lg md:px-2 md:py-1 md:text-[11px]">
            <AppVersionLabel />
          </span>
          <HeaderUpdateButton />
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-line p-1.5 text-muted hover:bg-surface-2 hover:text-ink md:p-2"
            title="Sign out"
          >
            <LogOut className="mx-auto size-4" />
          </button>
        </div>
      </div>
      <ActiveJobsBanner />
      <UpdateBanner canUpdate className="mx-4 mb-3 md:mx-8" />
    </header>
  );
}
