/**
 * /api/auth/moyu/* 路由：
 *   GET  /login        → 跳转摸鱼岛授权页
 *   GET  /callback     → 处理回调，决定 client_secret、获取用户信息
 *   GET  /me           → 当前已登录用户信息（前端轮询 / 拉取）
 *   POST /logout        → 退出登录
 */
import { Router, type Request, type Response } from 'express';
import type { OAuth2Config } from './types.js';
import type { FishUserInfo } from './types.js';
import { createState, verifyState } from './stateToken.js';
import { exchangeCodeForToken, fetchUserInfo } from './yucoder.js';
import { YUCODER_AUTHORIZE_URL } from './types.js';

const SESSION_USER_KEY = 'parti:fishUser';

interface SessionData {
  [SESSION_USER_KEY]?: FishUserInfo;
}

function safeNext(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  // 只接受同源相对路径，避免开放重定向
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

export interface AuthorizeUrlResponse {
  url: string;
}

export function createOAuth2Router(config: OAuth2Config): Router {
  const router = Router();

  // `/login` 返回 JSON，浏览器手动跳转到摸鱼岛授权页，
  // 这样地址栏先显示的是 yucoder.cn 而不是我们的后端 /api/auth/moyu/login。
  router.get('/login', (req: Request, res: Response) => {
    const next = safeNext(req.query.next, '/');
    const state = createState(config.stateSecret, next);
    const authorizeUrl = new URL(YUCODER_AUTHORIZE_URL);
    authorizeUrl.searchParams.set('client_id', config.clientId);
    authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', config.scope ?? 'read');
    authorizeUrl.searchParams.set('state', state);
    res.json({ url: authorizeUrl.toString() } satisfies AuthorizeUrlResponse);
  });

  router.get('/callback', async (req: Request, res: Response) => {
    const error = typeof req.query.error === 'string' ? req.query.error : null;
    if (error) {
      res.redirect(302, `/?oauth_error=${encodeURIComponent(error)}`);
      return;
    }
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    if (!code || !state) {
      res.status(400).send('OAuth2 callback 缺少 code/state');
      return;
    }
    let next: string;
    try {
      const verified = verifyState(state, config.stateSecret);
      next = safeNext(verified.next, '/');
    } catch (reason) {
      res.status(400).send(`OAuth2 state 校验失败: ${reason instanceof Error ? reason.message : String(reason)}`);
      return;
    }
    try {
      const token = await exchangeCodeForToken({
        code,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
      });
      const user = await fetchUserInfo(token.access_token);
      (req.session as SessionData)[SESSION_USER_KEY] = user;
      res.redirect(302, next);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      res.status(502).send(`OAuth2 登录失败: ${message}`);
    }
  });

  router.get('/me', (req: Request, res: Response) => {
    const session = req.session as SessionData;
    if (!session[SESSION_USER_KEY]) {
      res.status(401).json({ user: null });
      return;
    }
    res.json({ user: session[SESSION_USER_KEY] });
  });

  router.post('/logout', (req: Request, res: Response) => {
    const session = req.session as SessionData;
    delete session[SESSION_USER_KEY];
    res.json({ ok: true });
  });

  return router;
}

export const SESSION_USER_FIELD = SESSION_USER_KEY;