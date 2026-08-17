import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
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

const fieldClass =
  "w-full rounded-xl border border-line bg-bg px-3 py-3 text-base outline-none focus:border-accent md:text-sm";

export default function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saved = loadLoginPrefs();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [host, setHost] = useState(saved?.host ?? "");
  const [realm, setRealm] = useState(saved?.realm ?? "pam");
  const [checkCert, setCheckCert] = useState(saved?.checkCert ?? false);
  const [hasToken, setHasToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(() => !saved?.host);

  useEffect(() => {
    void authApi
      .defaults()
      .then((d) => {
        setHasToken(d.hasToken);
        if (loadLoginPrefs()) return;
        if (d.host) setHost((h) => h || d.host);
        if (d.realm) setRealm((r) => r || d.realm);
        const userEl = usernameRef.current;
        if (d.username && userEl && !userEl.value) userEl.value = d.username;
      })
      .catch(() => undefined);

    void authApi
      .me()
      .then(() => navigate("/", { replace: true }))
      .catch(() => undefined);
  }, [navigate]);

  function readCredentials() {
    return {
      username: usernameRef.current?.value.trim() ?? "",
      password: passwordRef.current?.value ?? "",
    };
  }

  async function submit(ev: FormEvent | MouseEvent, useEnvToken = false) {
    ev.preventDefault();
    const form =
      "currentTarget" in ev && ev.currentTarget instanceof HTMLFormElement
        ? ev.currentTarget
        : usernameRef.current?.form ?? null;
    const fd = form ? new FormData(form) : null;
    const username = (
      fd ? String(fd.get("username") ?? "") : readCredentials().username
    ).trim();
    const password = fd
      ? String(fd.get("password") ?? "")
      : readCredentials().password;
    if (!useEnvToken && (!host.trim() || !username || !password)) {
      setError("Server, username, and password are required.");
      return;
    }
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
          method="post"
          action="/login"
          autoComplete="on"
          onSubmit={(e) => void submit(e, false)}
          className="rounded-2xl border border-line bg-surface/90 p-6 shadow-2xl backdrop-blur"
        >
          <div className="mb-4">
            <label htmlFor="username" className="mb-1.5 block text-xs text-muted">
              Username
            </label>
            <input
              ref={usernameRef}
              id="username"
              name="username"
              type="text"
              defaultValue={saved?.username ?? ""}
              placeholder="root"
              className={fieldClass}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>

          <div className="mb-5">
            <label htmlFor="password" className="mb-1.5 block text-xs text-muted">
              Password
            </label>
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type="password"
              className={`${fieldClass} pr-12`}
              autoComplete="current-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>

          <details
            className="mb-5 border-t border-line pt-4"
            open={connectionOpen}
            onToggle={(e) => setConnectionOpen(e.currentTarget.open)}
          >
            <summary className="cursor-pointer text-xs text-muted">
              Connection{host ? ` · ${host}` : ""}
            </summary>
            <div className="mt-3">
              <label htmlFor="proxpanel-server" className="mb-1.5 block text-xs text-muted">
                Proxmox server
              </label>
              <input
                id="proxpanel-server"
                name="proxpanel-server"
                type="text"
                inputMode="url"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="https://192.168.1.10:8006"
                className={fieldClass}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <div className="mt-4">
              <label htmlFor="proxpanel-realm" className="mb-1.5 block text-xs text-muted">
                Realm
              </label>
              <select
                id="proxpanel-realm"
                name="proxpanel-realm"
                value={realm}
                onChange={(e) => setRealm(e.target.value)}
                className={fieldClass}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
              >
                <option value="pam">pam (Linux)</option>
                <option value="pve">pve</option>
              </select>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                name="proxpanel-check-cert"
                checked={checkCert}
                onChange={(e) => setCheckCert(e.target.checked)}
                className="accent-accent"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
              />
              Verify TLS certificate
            </label>
          </details>

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
