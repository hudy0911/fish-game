/**
 * 把 OAuth2 路由组装成一个 express app 工厂，供 Vite 中间件在 dev/preview 同进程内挂载。
 * 同源部署后，前端 fetch /api/auth/moyu/* 不再跨域，也不再走 Vite proxy。
 */
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import type { AppConfig } from './types.js';
import { createOAuth2Router } from './oauth2Router.js';

export interface AuthApp {
  app: express.Express;
  /** 同源场景下供 vite/预览进程日志显示 */
  redirectUri: string;
}

/**
 * 创建 express app 实例。注意：
 *   - 不在此调用 app.listen()，因为 dev/preview 由 Vite 的 httpServer 统一监听 5157；
 *   - session cookie name 保持 'parti.sid'，与原 @parti/api 一致，避免迁移时 cookie 失效。
 *   - session store 走 express-session 默认的内存 store。用户态展示由前端
 *     localStorage 缓存（apps/web/src/lib/fishUser.ts），后端 session 仅
 *     作为 /me 校验的事实来源；重启服务时浏览器内缓存的前端用户态仍可立即
 *     展示给用户，后台 /me 会以 401 触发前端清缓存并跳 OAuth。
 */
export function createAuthApp(config: AppConfig): AuthApp {
  const app = express();

  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  // 生产 https 部署时把 cookie.secure 设 true；通过 PARTI_COOKIE_SECURE=1 显式开启
  // （自动检测 X-Forwarded-Proto 留给反代层做；这里只认显式开关）。
  const cookieSecure = process.env.PARTI_COOKIE_SECURE === '1'
    || process.env.PARTI_COOKIE_SECURE === 'true';

  app.use(
    session({
      name: 'parti.sid',
      secret: config.oauth2.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSecure,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 天
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth/moyu', createOAuth2Router(config.oauth2));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    next();
  });

  return { app, redirectUri: config.oauth2.redirectUri };
}
