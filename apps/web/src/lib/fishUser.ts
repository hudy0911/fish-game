/**
 * 与后端 OAuth2 (/api/auth/moyu/*) 通信的客户端封装。
 *
 * 用户态本身（已登录的摸鱼岛用户）由后端 session cookie 持有；
 * 前端在 localStorage 里缓存一份 FishUser，让刷新/重启后 UI 立即有用户信息，
 * 之后后台静默调 /me 校验 session 是否仍然有效：
 *   - 200：缓存与服务器一致，保留
 *   - 401：session 失效 → 清缓存 + notify（外层 App 的"未登录拦截" effect
 *           会自动跳 yucoder 重新走 OAuth）
 *
 * localStorage 里不存任何敏感凭据（access_token、cookie 都只在服务端 session），
 * 存的只是展示用的 {id, username, name, avatar}。
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

interface CachedEntry {
  user: FishUser;
  /** 缓存写入时间戳 (ms)，仅用于排查，不参与判断 */
  cachedAt: number;
}

const CACHE_KEY = 'parti:fishUser';

let cachedUser: FishUser | null = readFromStorage();
/**
 * 启动时是否读到过缓存。仅决定后续 /me 401 的处理策略：
 *   - true: 401 视作"服务端 session 临时不可用"（例如重启），保留缓存。
 *           避免用户每次刷新或后端短暂重启就被踢回登录页——前端用户态本身
 *           是 localStorage 缓存的目的就是对抗服务端 session 失效。
 *   - false: 401 表示"用户从未登录或主动退出"，正常清缓存触发 OAuth。
 * 启动后此值不再变化，逻辑是只读快照。
 */
const hadCacheOnBoot: boolean = cachedUser !== null;
let inflight: Promise<FishUser | null> | null = null;
const listeners = new Set<(user: FishUser | null) => void>();

function notify(): void {
  for (const listener of listeners) listener(cachedUser);
}

function readFromStorage(): FishUser | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (!parsed || typeof parsed !== 'object' || !parsed.user?.id) {
      // 损坏的缓存：清掉，避免反复报错
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed.user;
  } catch {
    return null;
  }
}

function writeToStorage(user: FishUser | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (user) {
      const entry: CachedEntry = { user, cachedAt: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // 配额满 / 隐私模式：忽略，不影响内存态
  }
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

/**
 * 静默把缓存里残留的旧用户清掉，让外层 App 里的"未登录拦截" effect
 * 统一走 startFishOAuth 跳 yucoder。不直接跳 /login，是为了避免和现有
 * 的路由（hash 路由）逻辑冲突——刷新后 fishUser 变 null 时，App.tsx
 * 的拦截 effect 会自己处理跳转。
 *
 * 如果启动时就有缓存（hadCacheOnBoot），说明这是"启动到本 session 一直
 * 都有用户态"，401 更可能是"后端 session 丢失/重启"，不应清缓存——
 * 否则每次服务重启都会强制用户重走一遍 OAuth2，破坏 localStorage 缓存
 * 的初衷。
 */
function invalidateSilently(): void {
  if (hadCacheOnBoot) {
    return;
  }
  cachedUser = null;
  writeToStorage(null);
  notify();
}

/**
 * 从后端拉取当前登录态。返回 401 时静默清缓存并通知监听者；
 * 跳登录由 App.tsx 的拦截 effect 统一处理（保持单一跳转入口）。
 * 并发场景下共用同一 promise。
 */
export async function refreshFishUser(): Promise<FishUser | null> {
  if (inflight) return inflight;
  const promise = (async () => {
    try {
      const response = await fetch('/api/auth/moyu/me', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 401) {
        invalidateSilently();
        return null;
      }
      if (!response.ok) {
        // 5xx / 网络错误：保留现有缓存，避免误清空让用户"刚进来就被打回登录"
        return cachedUser;
      }
      const data = (await response.json()) as MeResponse;
      cachedUser = data.user;
      writeToStorage(cachedUser);
      notify();
      return cachedUser;
    } catch {
      // 网络异常：同样保留缓存，等下次再校验
      return cachedUser;
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
 * 这样浏览器地址栏先停在 yucoder.cn，不会先经过我们 /api/auth/moyu/login 的 302。
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
    writeToStorage(null);
    notify();
  }
}
