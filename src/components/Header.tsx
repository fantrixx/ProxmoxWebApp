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
    <header className="flex items-center justify-between gap-4 border-b border-line px-8 py-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm">{user.username}</div>
          <div className="max-w-56 truncate font-mono text-[11px] text-muted">
            {user.host.replace(/^https?:\/\//, "")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg border border-line p-2 text-muted hover:bg-surface-2 hover:text-ink"
          title="Abmelden"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  );
}
