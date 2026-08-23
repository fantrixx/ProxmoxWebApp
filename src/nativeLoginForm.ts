/** Persistent login <form> that lives in index.html (outside #root). */

export const LOGIN_FORM_ID = "login";

export function getNativeLoginForm(): HTMLFormElement | null {
  const el = document.getElementById(LOGIN_FORM_ID);
  return el instanceof HTMLFormElement ? el : null;
}

function setLoginControlsDisabled(form: HTMLFormElement, disabled: boolean) {
  form.querySelectorAll("input, button").forEach((el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
      el.disabled = disabled;
    }
  });
}

/** Move the document-level login form into the login card and show it. */
export function adoptNativeLoginForm(
  slot: HTMLElement,
  savedUsername: string,
): HTMLFormElement | null {
  const form = getNativeLoginForm();
  if (!form) return null;

  form.hidden = false;
  setLoginControlsDisabled(form, false);

  const username = form.querySelector<HTMLInputElement>("#username");
  if (username && !username.value && savedUsername) {
    username.value = savedUsername;
  }

  if (form.parentElement !== slot) {
    slot.appendChild(form);
  }
  return form;
}

/** Hide the login form so password managers ignore it on signed-in pages. */
export function releaseNativeLoginForm() {
  const form = getNativeLoginForm();
  if (!form) return;
  form.hidden = true;
  setLoginControlsDisabled(form, true);
  document.body.appendChild(form);
}

export function setNativeLoginPending(form: HTMLFormElement, pending: boolean) {
  const submit = form.querySelector<HTMLButtonElement>("#login-submit");
  if (!submit) return;
  submit.disabled = pending;
  submit.textContent = pending ? "Connecting…" : "Sign in";
}
