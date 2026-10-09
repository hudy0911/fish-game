/**
 * 生产启动脚本 —— 单进程托管 Vite 打包产物 + 摸鱼岛 OAuth2 + 大厅 mock。
 *
 * 默认端口与 dev 模式完全一致（5157 / 5158），所以 .env.local 不用改就能跑：
 *   - 5157：对外服务（静态资源、SPA fallback、OAuth2 /api/*）
 *   - 5158：lobby-mock，仅本进程内部访问
 *
 * 启动顺序：
 *   1. spawn lobby-mock 子进程（127.0.0.1:5158）
 *   2. 等待 mock /v1/health 通
 *   3. 用 tsx loader 加载 apps/web/src/server/auth/config + authApp，构造 express app
 *   4. 主 HTTP 服务器（5157）：
 *      /v1/*  → 反代 5158
 *      /api/* → OAuth2 express app（auth 中间件）
 *      其余   → apps/web/dist/ + SPA fallback
 *
 * 用法（package.json scripts.start 已配好）：
 *   pnpm start
 *
 * 可覆盖环境变量：
 *   PORT               外部端口，默认 5157
 *   HOST               绑定地址，默认 0.0.0.0
 *   LOBBY_INTERNAL     mock 内部端口，默认 5158
 *   STATIC_DIR         静态目录，默认 apps/web/dist
 *   LOBBY_STORAGE_FILE 持久化文件，默认 data/lobby.json（data/ 在 .gitignore）
 *   ALLOWED_ORIGINS    CORS 白名单（生产必填，逗号分隔）
 *   PARTI_WEB_PORT     OAuth2 配置里的 port，影响默认 redirect_uri（默认 5157）
 *   PARTI_OAUTH2_*     OAuth2 凭据（不写则从 apps/web/config.local.json 读）
 */
import {
  createServer as createHttpServer,
  request as httpRequest,
} from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir   = resolve(__dirname, '..');

const PORT            = Number.parseInt(process.env.PORT ?? '5157', 10) || 5157;
const HOST            = process.env.HOST ?? '0.0.0.0';
const LOBBY_INTERNAL  = Number.parseInt(process.env.LOBBY_INTERNAL ?? '5158', 10) || 5158;
const STATIC_DIR      = resolve(rootDir, process.env.STATIC_DIR ?? 'apps/web/dist');
// 默认持久化到 ./data/lobby.json；data/ 已被 .gitignore 忽略，不会入仓。
const LOBBY_STORAGE   = process.env.LOBBY_STORAGE_FILE
  ?? resolve(rootDir, 'data/lobby.json');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
};

function mimeType(p) {
  return MIME[extname(p).toLowerCase()] ?? 'application/octet-stream';
}

const indexContent = await readFile(join(STATIC_DIR, 'index.html')).catch(() => null);

async function serveFile(urlPath, res) {
  let clean = decodeURIComponent(urlPath.replace(/^\/+/, ''));
  if (clean.endsWith('/')) clean = clean.slice(0, -1);
  const candidates = [clean, `index.html/${clean}`];
  for (const c of candidates) {
    const full = join(STATIC_DIR, c);
    try {
      const st = await stat(full);
      if (st.isFile()) {
        const content = await readFile(full);
        const cacheControl = (c === 'index.html' || c.endsWith('/index.html'))
          ? 'no-cache'
          : 'public, max-age=31536000, immutable';
        res.writeHead(200, { 'Content-Type': mimeType(full), 'Cache-Control': cacheControl });
        res.end(content);
        return true;
      }
    } catch {}
  }
  return false;
}

function proxyToLobby(req, res) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024) { aborted = true; req.destroy(); }
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) { resolve(); return; }
      const options = {
        hostname: '127.0.0.1',
        port: LOBBY_INTERNAL,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, 'content-length': String(total) },
      };
      delete options.headers.host;
      delete options.headers.connection;

      const proxyReq = httpRequest(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
        proxyRes.on('end', resolve);
        proxyRes.on('error', () => resolve());
      });
      proxyReq.on('error', (err) => {
        console.error(`[start] lobby proxy error: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'BAD_GATEWAY', message: 'Lobby unavailable' } }));
        }
        resolve();
      });
      proxyReq.end(Buffer.concat(chunks));
    });
    req.on('error', () => resolve());
  });
}

function corsHeaders(origin) {
  const allowOrigin =
    !origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)
      ? (origin ?? '*') : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

// ── 启动 OAuth2 express 中间件 ────────────────────────────────
// 通过 tsx loader 直接 import 仓库里的 .ts 源文件。
// 失败时给 /api/* 一个 503 响应，避免落到 SPA fallback 返回 HTML 让前端 JSON.parse 报错。
let authApp = null;
let authRedirectUri = null;
try {
  // 强制 config.ts 读出 PORT 一致的值
  process.env.PARTI_WEB_PORT = String(PORT);
  process.env.PARTI_API_PORT = String(PORT);
  process.env.NODE_ENV = 'production';
  const configMod = await import('../apps/web/src/server/auth/config.js');
  const appMod    = await import('../apps/web/src/server/auth/authApp.js');
  const cfg = configMod.loadConfig();
  const auth = appMod.createAuthApp(cfg);
  authApp = auth.app;
  authRedirectUri = auth.redirectUri;
  console.log(`[start] OAuth2 mounted on same origin (${PORT})`);
  console.log(`[start] OAuth2 redirect_uri: ${authRedirectUri}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[start] OAuth2 加载失败，/api/* 将返回 503: ${message}`);
  authApp = null;
}

function handleAuthUnavailable(_req, res) {
  res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'auth-not-configured' }));
}

// ── 启动 Lobby Mock ───────────────────────────────────────────

const lobbyEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(LOBBY_INTERNAL),
  HOST: '127.0.0.1',
  ALLOWED_ORIGINS: ALLOWED_ORIGINS.join(','),
  STORAGE_FILE: LOBBY_STORAGE,
};

const lobbyProc = spawn(process.execPath, [join(__dirname, 'lobby-mock.mjs')], {
  env: lobbyEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
lobbyProc.stdout.pipe(process.stdout);
lobbyProc.stderr.pipe(process.stderr);

function shutdownLobby(sig) {
  console.log(`[start] forwarding ${sig} to lobby-mock…`);
  lobbyProc.kill(sig);
}

async function waitForLobby(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ok = await new Promise((resolve) => {
        const req = httpRequest({
          hostname: '127.0.0.1',
          port: LOBBY_INTERNAL,
          path: '/v1/health',
          method: 'GET',
        }, (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.end();
      });
      if (ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('lobby-mock 启动超时');
}

// ── 主 HTTP 服务器 ────────────────────────────────────────────

const server = createHttpServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    const allowed = !origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);
    if (!allowed) { res.writeHead(403); res.end(); return; }
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  // 非白名单 Origin 直接拒绝
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'ORIGIN_NOT_ALLOWED' } }));
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  // /v1/*  → lobby mock
  if (url.pathname.startsWith('/v1/')) {
    await proxyToLobby(req, res);
    return;
  }

  // /api/* → OAuth2 express app（必须在静态/SPA fallback 之前，否则会返回 HTML）
  if (url.pathname.startsWith('/api/')) {
    if (authApp) {
      authApp(req, res);
    } else {
      handleAuthUnavailable(req, res);
    }
    return;
  }

  // 静态文件
  if (await serveFile(url.pathname, res)) return;

  // SPA fallback → index.html
  if (indexContent) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(indexContent);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// ── 启动 ─────────────────────────────────────────────────────

server.on('error', (err) => {
  console.error(`[start] server error: ${err.message}`);
  process.exit(1);
});

try {
  await waitForLobby();
} catch (err) {
  console.error(`[start] ${err.message}`);
  lobbyProc.kill('SIGTERM');
  process.exit(1);
}

mkdirSync(LOBBY_STORAGE.replace(/[/\\][^/\\]+$/, ''), { recursive: true });

server.listen(PORT, HOST, () => {
  console.log(`[start] listening on http://${HOST}:${PORT}`);
  console.log(`[start] lobby storage: ${LOBBY_STORAGE}`);
  console.log(`[start] lobby API: http://${HOST}:${LOBBY_INTERNAL}/v1/*`);
  console.log(`[start] static dir: ${STATIC_DIR}`);
  if (ALLOWED_ORIGINS.length > 0) {
    console.log(`[start] CORS allow: ${ALLOWED_ORIGINS.join(', ')}`);
  } else {
    console.log(`[start] CORS: ANY`);
  }
  console.log(`[start] SPA fallback on /, /api/* on OAuth2`);
});

// ── 优雅退出 ─────────────────────────────────────────────────

function shutdown(sig) {
  console.log(`[start] received ${sig}, shutting down…`);
  shutdownLobby(sig);
  server.close(() => {
    console.log('[start] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
