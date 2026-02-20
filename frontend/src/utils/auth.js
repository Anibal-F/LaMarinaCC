const SESSION_KEY = "lmcc_user";
const AUTH_EVENT = "lmcc-auth-changed";
const HOURS_8_MS = 8 * 60 * 60 * 1000;
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

function notifyAuthChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

export function createSession(userPayload, rememberMe = false) {
  const now = Date.now();
  const ttl = rememberMe ? DAYS_30_MS : HOURS_8_MS;
  const session = {
    ...userPayload,
    session_started_at: new Date(now).toISOString(),
    session_expires_at: new Date(now + ttl).toISOString(),
    remember_me: Boolean(rememberMe)
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notifyAuthChanged();
  return session;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  notifyAuthChanged();
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const expiresAt = parsed?.session_expires_at
      ? Date.parse(parsed.session_expires_at)
      : Number.NaN;

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearSession();
      return null;
    }

    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getSession());
}

export { AUTH_EVENT };
