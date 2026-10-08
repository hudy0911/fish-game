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
 */
export function createAuthApp(config: AppConfig): AuthApp {
  const app = express();

  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  app.use(
    session({
      name: 'parti.sid',
      secret: config.oauth2.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false, // 本地 http 调试，部署到 https 时改 true
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