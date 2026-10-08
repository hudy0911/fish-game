/**
 * Vite 插件：把 OAuth2 express app 以 connect 中间件形式挂在 Vite 自带的 httpServer 上。
 *
 * dev (vite dev) 与 preview (vite preview) 都生效，对外只暴露一个端口（5157）。
 *
 * 注意：
 *   - Vite 的中间件是在它自己处理 HMR/静态资源前调用，对 /api/* 早返回；其它路径继续交给 Vite。
 *   - 同源部署后，前端 fetch /api/auth/moyu/* 不再跨域、不再走 proxy，session cookie 自动带上。
 */
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { loadConfig } from './config.js';
import { createAuthApp } from './authApp.js';

export function authMiddlewarePlugin(): Plugin {
  return {
    name: 'parti-auth-middleware',
    apply: 'serve', // 只在 vite dev / preview 启动；build 阶段不参与
    configureServer(server: ViteDevServer) {
      installAuthOnVite(server.middlewares, '[parti/auth]');
    },
    configurePreviewServer(server: PreviewServer) {
      installAuthOnVite(server.middlewares, '[parti/auth:preview]');
    },
  };
}

/**
 * 阻止 config.local.json 被 Vite 当作静态资源直接对外暴露（OAuth2 凭据会泄露）。
 * 该中间件必须装在 vite 的 staticMiddleware 之前——通过 configureServer 第一阶段返回即可。
 */
export function denyLocalConfigsPlugin(): Plugin {
  return {
    name: 'parti-deny-local-configs',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (typeof req.url === 'string' && /(^|\/)config\.local\.json$/.test(req.url)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        next();
      });
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((req, res, next) => {
        if (typeof req.url === 'string' && /(^|\/)config\.local\.json$/.test(req.url)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        next();
      });
    },
  };
}

function installAuthOnVite(
  middlewares: ViteDevServer['middlewares'],
  tag: string,
): void {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${tag} 配置错误: ${message}`);
    // 配置错误时，给所有 /api 请求返回 503，避免 Vite 把它们当 SPA 路由返回 index.html。
    // 用原生 http 响应，因为这里的 res 是 connect 中间件形态，不是 express Response。
    const body = JSON.stringify({ error: 'auth-not-configured', detail: message });
    middlewares.use('/api', (_req, res) => {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(body);
    });
    return;
  }

  const { app, redirectUri } = createAuthApp(config);
  middlewares.use(app);
  console.log(`${tag} OAuth2 mounted on same origin`);
  console.log(`${tag} OAuth2 redirect_uri: ${redirectUri}`);
}