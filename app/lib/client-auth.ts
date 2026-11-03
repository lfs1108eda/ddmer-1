export type AuthUser = {
  id: number;
  username: string;
  nickname?: string;
  avatar?: string;
  bio?: string;
};

const TOKEN_KEY = "waopa_token";
const REFRESH_KEY = "waopa_refresh";
const USER_KEY = "waopa_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders(extra: Record<string, string> = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

/** 用 refreshToken 换一个新的 accessToken；失败返回 null */
export async function refreshSession(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch("/api/auth/refresh-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.data;
    if (!data?.accessToken) return null;
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

/**
 * 带自动续期的 fetch：遇到 401 先尝试刷新 token 再重试一次。
 * 刷新失败时返回原始的 401 响应，调用方据此提示重新登录。
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) =>
    fetch(input, {
      ...init,
      headers: {
        ...((init.headers as Record<string, string>) || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

  let res = await send(getToken());
  if (res.status === 401) {
    const fresh = await refreshSession();
    if (fresh) res = await send(fresh);
  }
  return res;
}

/** 判断 JWT 是否已过期（留 60 秒余量） */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const base = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base));
    if (!payload?.exp) return false;
    return payload.exp * 1000 < Date.now() + 60_000;
  } catch {
    return true;
  }
}

export function slugify(title: string) {
  const ascii = title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || `post-${Date.now().toString(36)}`;
}
