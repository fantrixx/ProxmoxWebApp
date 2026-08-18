const LAST_KEY = "proxpanel.visit.lastAt";
const PREV_KEY = "proxpanel.visit.previousAt";
const SESSION_KEY = "proxpanel.visit.sessionAt";

export type VisitWindow = {
  /** Start of this browser session (this sign-in). */
  thisAt: number;
  /** Start of the previous session, if known. */
  previousAt: number | null;
};

function readNumber(store: Storage, key: string): number | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeNumber(store: Storage, key: string, value: number) {
  try {
    store.setItem(key, String(value));
  } catch {
    /* quota / private mode */
  }
}

/** Call once per tab session (or with force on a fresh password login). */
export function markVisit(force = false): VisitWindow {
  const existing = readNumber(sessionStorage, SESSION_KEY);
  if (!force && existing) {
    return {
      thisAt: existing,
      previousAt: readNumber(localStorage, PREV_KEY),
    };
  }

  const now = Date.now();
  const previous = readNumber(localStorage, LAST_KEY);
  if (previous && previous < now - 5_000) {
    writeNumber(localStorage, PREV_KEY, previous);
  }
  writeNumber(localStorage, LAST_KEY, now);
  writeNumber(sessionStorage, SESSION_KEY, now);
  return {
    thisAt: now,
    previousAt: previous && previous < now - 5_000 ? previous : readNumber(localStorage, PREV_KEY),
  };
}

export function readVisit(): VisitWindow {
  const thisAt = readNumber(sessionStorage, SESSION_KEY) || Date.now();
  return {
    thisAt,
    previousAt: readNumber(localStorage, PREV_KEY),
  };
}

/** Tasks after this timestamp (ms) count as “since last sign-in”. */
export function visitCutoffMs(visit: VisitWindow): number {
  return visit.previousAt || visit.thisAt;
}
