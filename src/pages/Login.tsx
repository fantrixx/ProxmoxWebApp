import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Cpu } from "lucide-react";
import { ApiError, authApi } from "../api";
import { AppVersionLabel } from "../components/AppVersion";
import { UpdateBanner } from "../components/UpdateBanner";
import {
  adoptNativeLoginForm,
  getNativeLoginForm,
  releaseNativeLoginForm,
  setNativeLoginPending,
} from "../nativeLoginForm";
import { markVisit } from "../visit";

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

const ignorePwMgr = {
  autoComplete: "off" as const,
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-form-type": "other",
};

export default function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saved = loadLoginPrefs();
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const nativeFormRef = useRef<HTMLFormElement | null>(null);
  const hostRef = useRef(saved?.host ?? "");
  const realmRef = useRef(saved?.realm ?? "pam");
  const checkCertRef = useRef(saved?.checkCert ?? false);
  const loginRef = useRef<(useEnvToken?: boolean) => Promise<void>>(async () => {});

  const [host, setHost] = useState(saved?.host ?? "");
  const [realm, setRealm] = useState(saved?.realm ?? "pam");
  const [checkCert, setCheckCert] = useState(saved?.checkCert ?? false);
  const [hasToken, setHasToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(() => !saved?.host);
  const [usingNativeForm] = useState(() => !!getNativeLoginForm());
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);

  hostRef.current = host;
  realmRef.current = realm;
  checkCertRef.current = checkCert;

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    const form = adoptNativeLoginForm(slot, saved?.username ?? "");
    if (!form) return;

    nativeFormRef.current = form;
    usernameRef.current = form.querySelector<HTMLInputElement>("#username");
    passwordRef.current = form.querySelector<HTMLInputElement>("#password");
    setStatusSlot(form.querySelector<HTMLElement>("#login-status"));

    const onSubmit = (ev: Event) => {
      ev.preventDefault();
      void loginRef.current(false);
    };
    form.addEventListener("submit", onSubmit);

    return () => {
      form.removeEventListener("submit", onSubmit);
      nativeFormRef.current = null;
      releaseNativeLoginForm();
    };
  }, [saved?.username]);

  useEffect(() => {
    const form = nativeFormRef.current;
    if (form) setNativeLoginPending(form, pending);
  }, [pending]);

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
    const form = nativeFormRef.current ?? usernameRef.current?.form ?? null;
    if (form) {
      const fd = new FormData(form);
      return {
        username: String(fd.get("username") ?? "").trim(),
        password: String(fd.get("password") ?? ""),
      };
    }
    return {
      username: usernameRef.current?.value.trim() ?? "",
      password: passwordRef.current?.value ?? "",
    };
  }

  async function login(useEnvToken = false) {
    const { username, password } = readCredentials();
    const hostValue = hostRef.current;
    const realmValue = realmRef.current;
    const checkCertValue = checkCertRef.current;
    if (!useEnvToken && (!hostValue.trim() || !username || !password)) {
      setError("Server, username, and password are required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const user = await authApi.login({
        host: hostValue,
        username,
        password,
        realm: realmValue,
        rejectUnauthorized: checkCertValue,
        useEnvToken,
      });
      saveLoginPrefs({
        host: hostValue,
        username,
        realm: realmValue,
        checkCert: checkCertValue,
      });
      markVisit(true);
      qc.setQueryData(["me"], user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : "Sign-in failed",
      );
    } finally {
      setPending(false);
    }
  }

  loginRef.current = login;

  async function submit(ev: FormEvent | MouseEvent, useEnvToken = false) {
    ev.preventDefault();
    await login(useEnvToken);
  }

  const errorBox = error ? (
    <p className="mb-4 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
      {error}
    </p>
  ) : null;

  return (
    <div className="bg-grid min-h-dvh">
      {usingNativeForm && statusSlot ? createPortal(errorBox, statusSlot) : null}
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

        <div className="rounded-2xl border border-line bg-surface/90 p-6 shadow-2xl backdrop-blur">
          {/*
            Username + password must be the only fillable fields in the login
            form. Extra inputs (server URL, realm) in the same <form> make iOS
            Safari / 1Password treat the page as a generic form and skip AutoFill.
            data-1p-ignore is ignored by Apple's iOS AutoFill (which 1Password uses).
          */}
          {usingNativeForm ? (
            <div ref={slotRef} />
          ) : (
            <form
              id="login"
              name="login"
              method="post"
              action="/login"
              autoComplete="on"
              data-form-type="login"
              onSubmit={(e) => void submit(e, false)}
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
                  className={fieldClass}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
              {errorBox}
              <button
                type="submit"
                disabled={pending}
                className="min-h-12 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-black hover:bg-accent-2 disabled:opacity-50"
              >
                {pending ? "Connecting…" : "Sign in"}
              </button>
            </form>
          )}

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

          {!window.isSecureContext ? (
            <p className="mt-4 text-center text-xs leading-relaxed text-muted">
              Password autofill (1Password, Safari) usually needs{" "}
              <span className="font-mono">https://</span>. On{" "}
              <span className="font-mono">http://</span>, tap the password field,
              then choose Passwords / 1Password above the keyboard.
            </p>
          ) : null}

          <form
            id="login-connection"
            name="login-connection"
            autoComplete="off"
            data-1p-ignore
            data-form-type="other"
            className="mt-5 border-t border-line pt-4"
            onSubmit={(e) => e.preventDefault()}
          >
            <details
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
                  {...ignorePwMgr}
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
                  {...ignorePwMgr}
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
                  {...ignorePwMgr}
                />
                Verify TLS certificate
              </label>
            </details>
          </form>
        </div>

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
