/**
 * 与 @parti/api (/api/oauth2/*) 通信的客户端封装。
 *
 * 用户态本身（已登录的摸鱼岛用户）由后端 session cookie 持有；
 * 前端只缓存一个内存副本用于 UI 展示，不参与权限判断。
 */

export interface FishUser {
  /** 摸鱼岛稳定用户 id (string). */
  id: string;
  username: string;
  name: string;
  avatar?: string;
}

interface MeResponse {
  user: FishUser | null;
}

let cachedUser: FishUser | null = null;
let inflight: Promise<FishUser | null> | null = null;
const listeners = new Set<(user: FishUser | null) => void>();

function notify(): void {
  for (const listener of listeners) listener(cachedUser);
}

export function getCachedFishUser(): FishUser | null {
  return cachedUser;
}

export function subscribeFishUser(listener: (user: FishUser | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const message = `${path} 失败 (HTTP ${response.status})`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** 从后端拉取当前登录态；并发场景下共用同一 promise。 */
export async function refreshFishUser(): Promise<FishUser | null> {
  if (inflight) return inflight;
  const promise = (async () => {
    try {
      const data = await request<MeResponse>('/api/auth/moyu/me');
      cachedUser = data.user;
      notify();
      return cachedUser;
    } catch {
      cachedUser = null;
      notify();
      return null;
    } finally {
      inflight = null;
    }
  })();
  inflight = promise;
  return promise;
}

interface AuthorizeUrlResponse {
  url: string;
}

/**
 * 请求后端拿到摸鱼岛授权页 URL，再交给浏览器直接跳转。
 * 这样浏览器地址栏先停在 yucoder.cn，不会先经过我们 /api/oauth2/login 的 302。
 */
export async function startFishOAuth(next: string): Promise<void> {
const response = await fetch(`/api/auth/moyu/login?next=${encodeURIComponent(next)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`/api/auth/moyu/login 失败 (HTTP ${response.status})`);
    }
  const data = (await response.json()) as AuthorizeUrlResponse;
  if (typeof data.url !== 'string' || !data.url.startsWith('http')) {
    throw new Error('后端返回的授权地址格式异常');
  }
  window.location.href = data.url;
}

export async function logoutFishUser(): Promise<void> {
  try {
    await request<{ ok: true }>('/api/auth/moyu/logout', { method: 'POST' });
  } finally {
    cachedUser = null;
    notify();
  }
}