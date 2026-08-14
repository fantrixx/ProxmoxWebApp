import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Cpu } from "lucide-react";
import { ApiError, authApi } from "../api";
import { AppVersionLabel } from "../components/AppVersion";
import { UpdateBanner } from "../components/UpdateBanner";

const LOGIN_PREFS_KEY = "proxpanel.login";

type LoginPrefs = {
  host: string;
  username: string;
  realm: string;
  checkCert: boolean;
};

function loadLoginPrefs(): LoginPrefs | null {
  try {
    const raw = localStorage.getItem(LOGIN_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LoginPrefs>;
    return {
      host: typeof parsed.host === "string" ? parsed.host : "",
      username: typeof parsed.username === "string" ? parsed.username : "",
      realm: parsed.realm === "pve" ? "pve" : "pam",
      checkCert: Boolean(parsed.checkCert),
    };
  } catch {
    return null;
  }
}

function saveLoginPrefs(prefs: LoginPrefs) {
  localStorage.setItem(LOGIN_PREFS_KEY, JSON.stringify(prefs));
}

export default function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saved = loadLoginPrefs();
  const [host, setHost] = useState(saved?.host ?? "");
  const [username, setUsername] = useState(saved?.username ?? "");
  const [password, setPassword] = useState("");
  const [realm, setRealm] = useState(saved?.realm ?? "pam");
  const [checkCert, setCheckCert] = useState(saved?.checkCert ?? false);
  const [hasToken, setHasToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void authApi
      .defaults()
      .then((d) => {
        setHasToken(d.hasToken);
        if (!loadLoginPrefs()) {
          if (d.host) setHost(d.host);
          if (d.username) setUsername(d.username);
          if (d.realm) setRealm(d.realm);
        }
      })
      .catch(() => undefined);

    void authApi
      .me()
      .then(() => navigate("/", { replace: true }))
      .catch(() => undefined);
  }, [navigate]);

  async function submit(ev: FormEvent, useEnvToken = false) {
    ev.preventDefault();
    setPending(true);
    setError(null);
    try {
      const user = await authApi.login({
        host,
        username,
        password,
        realm,
        rejectUnauthorized: checkCert,
        useEnvToken,
      });
      saveLoginPrefs({ host, username, realm, checkCert });
      qc.setQueryData(["me"], user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Sign-in failed",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-grid min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8 sm:px-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-accent text-black">
            <Cpu className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">ProxPanel</h1>
            <p className="text-sm text-muted">
              Proxmox VE Administration · <AppVersionLabel />
            </p>
          </div>
        </div>

        <UpdateBanner className="mb-4" />

        <form
          onSubmit={(e) => void submit(e, false)}
          className="rounded-2xl border border-line bg-surface/90 p-6 shadow-2xl backdrop-blur"
        >
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs text-muted">Proxmox server</span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="https://192.168.1.10:8006"
              className="w-full rounded-xl border border-line bg-bg px-3 py-3 text-base outline-none focus:border-accent md:text-sm"
              autoComplete="url"
              required={!hasToken}
            />
          </label>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1.5 block text-xs text-muted">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="root"
                className="w-full rounded-xl border border-line bg-bg px-3 py-3 text-base outline-none focus:border-accent md:text-sm"
                autoComplete="username"
                required={!hasToken}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs text-muted">Realm</span>
              <select
                value={realm}
                onChange={(e) => setRealm(e.target.value)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-3 text-base outline-none focus:border-accent md:text-sm"
              >
                <option value="pam">pam (Linux)</option>
                <option value="pve">pve</option>
              </select>
            </label>
          </div>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs text-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-bg px-3 py-3 text-base outline-none focus:border-accent md:text-sm"
              autoComplete="current-password"
              required={!hasToken}
            />
          </label>
          <label className="mb-5 flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={checkCert}
              onChange={(e) => setCheckCert(e.target.checked)}
              className="accent-accent"
            />
            Verify TLS certificate
          </label>

          {error ? (
            <p className="mb-4 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="min-h-12 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-black hover:bg-accent-2 disabled:opacity-50"
          >
            {pending ? "Connecting…" : "Sign in"}
          </button>

          {hasToken ? (
            <button
              type="button"
              disabled={pending}
              onClick={(e) => void submit(e, true)}
              className="mt-3 w-full rounded-xl border border-line py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              Connect with API token from .env
            </button>
          ) : null}
        </form>
        <p className="mt-6 text-center text-xs text-muted">
          Server, username, and realm are saved in this browser. The password is not.
        </p>
        <p className="mt-2 text-center font-mono text-[11px] text-muted">
          <AppVersionLabel showCommit />
        </p>
      </div>
    </div>
  );
}
