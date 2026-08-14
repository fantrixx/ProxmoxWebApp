import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api";
import { useApp } from "../context";

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
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:gap-4 md:px-8 md:py-5">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-muted md:text-sm">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <div className="hidden text-right sm:block">
          <div className="max-w-32 truncate text-sm md:max-w-none">{user.username}</div>
          <div className="hidden max-w-56 truncate font-mono text-[11px] text-muted md:block">
            {user.host.replace(/^https?:\/\//, "")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="min-h-11 min-w-11 rounded-lg border border-line p-2 text-muted hover:bg-surface-2 hover:text-ink md:min-h-0 md:min-w-0"
          title="Abmelden"
        >
          <LogOut className="mx-auto size-4" />
        </button>
      </div>
    </header>
  );
}
