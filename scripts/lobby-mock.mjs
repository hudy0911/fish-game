/**
 * 本地 mock 大厅服务 —— 纯 Node 实现，无任何外部依赖。
 *
 * 实现 docs/lobby-service.md 描述的最小子集，让本机 pnpm dev 能跑通"公开到大厅"流程：
 *   - GET  /v1/health
 *   - GET  /v1/rooms
 *   - POST /v1/rooms
 *   - PATCH /v1/rooms/:listingId
 *   - DELETE /v1/rooms/:listingId
 *
 * 租约 60 秒过期。
 *
 * 两种运行模式：
 *   1) 开发（默认，NODE_ENV != production）—— 内存 Map，ALLOWED_ORIGINS 全开（仅适合本机）。
 *   2) 生产（NODE_ENV=production）—— 进程内 Map + 写入 STORAGE_FILE（默认 ./data/lobby.json），
 *      ALLOWED_ORIGINS 通过同名环境变量以逗号分隔声明（不设置时仍全开，部署前请务必设置）。
 *
 * 用法：
 *   node scripts/lobby-mock.mjs                                  # 默认 http://127.0.0.1:5158
 *   PORT=6000 node scripts/lobby-mock.mjs                        # 自定义端口
 *   NODE_ENV=production PORT=3000 ALLOWED_ORIGINS=https://a.com,https://b.com \
 *     STORAGE_FILE=/var/lib/parti/lobby.json node scripts/lobby-mock.mjs
 */
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer as createHttpServer } from 'node:http';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = Number.parseInt(process.env.PORT ?? (IS_PRODUCTION ? '3000' : '5158'), 10) || 5158;
const HOST = process.env.HOST ?? (IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1');
const LEASE_TTL_MS = 60_000;
const MAX_BODY_BYTES = 12 * 1024;
const STORAGE_FILE = process.env.STORAGE_FILE ?? (IS_PRODUCTION ? './data/lobby.json' : '');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);


function now() {
  return Date.now();
}

function isExpired(entry) {
  return entry.expiresAt <= now();
}

function randomToken() {
  return randomBytes(24).toString('hex');
}

// === 持久化包装 =====================================================
// 生产模式下，每次写后异步落盘到 STORAGE_FILE；崩溃丢失 ≤ 1 条记录，
// 反正还有 60s 租约过期，足够实用。开发模式（STORAGE_FILE 为空）走纯内存。
function loadListings() {
  if (!STORAGE_FILE) return new Map();
  if (!existsSync(STORAGE_FILE)) return new Map();
  try {
    const raw = readFileSync(STORAGE_FILE, 'utf8').trim();
    if (raw.length === 0) return new Map();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return new Map(Object.entries(parsed));
    }
    console.warn('[lobby-mock] STORAGE_FILE 内容非对象，忽略');
    return new Map();
  } catch (error) {
    console.error('[lobby-mock] 读取 STORAGE_FILE 失败：', error.message);
    return new Map();
  }
}
/** @type {Map<string, { token: string, entry: object }>} */
const listings = loadListings();
let writeTimer = null;
function persistAsync() {
  if (!STORAGE_FILE) return;
  // 去抖：连续写合并到一次磁盘写。
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(STORAGE_FILE), { recursive: true });
      const obj = Object.fromEntries(listings);
      writeFileSync(STORAGE_FILE, JSON.stringify(obj));
    } catch (error) {
      console.error('[lobby-mock] 持久化失败：', error.message);
    }
  }, 200);
  writeTimer.unref?.();
}
function persistSync() {
  if (!STORAGE_FILE) return;
  clearTimeout(writeTimer);
  try {
    mkdirSync(dirname(STORAGE_FILE), { recursive: true });
    const obj = Object.fromEntries(listings);
    writeFileSync(STORAGE_FILE, JSON.stringify(obj));
  } catch (error) {
    console.error('[lobby-mock] 同步持久化失败：', error.message);
  }
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  // 开发（无白名单）放行；生产（已设置白名单）只放白名单内。
  // 浏览器对无 Origin 的同源请求也会不带 Origin 头，需要放行。
  const allowOrigin =
    !origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin) ? origin ?? '*' : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function rejectIfOriginNotAllowed(req, res) {
  // 生产 + 已配置白名单 + 跨域且 Origin 不在白名单 → 直接 403，避免 CORS 之外被滥用。
  if (!IS_PRODUCTION || ALLOWED_ORIGINS.length === 0) return false;
  const origin = req.headers.origin;
  if (!origin) return false; // 同源
  if (ALLOWED_ORIGINS.includes(origin)) return false;
  sendError(res, 403, 'ORIGIN_NOT_ALLOWED', 'Origin 未被 ALLOWED_ORIGINS 允许');
  return true;
}

function sendJson(res, status, body) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(res.req),
  };
  res.writeHead(status, headers);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413, code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400, code: 'INVALID_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

const REQUIRED_FIELDS = [
  'roomId',
  'hostPeerId',
  'title',
  'packageName',
  'playerCount',
  'maxPlayers',
  'joinable',
  'credentialRequired',
];

const FORBIDDEN_KEYS = ['password', 'credential', 'token', 'authorization', 'secret'];

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return '请求体必须是 JSON 对象';
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in input)) return `缺少字段 ${field}`;
  }
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_KEYS.includes(key)) return `禁止字段 ${key}`;
  }
  if (typeof input.roomId !== 'string' || input.roomId.length === 0 || input.roomId.length > 128) {
    return 'roomId 必须是 1-128 字符';
  }
  if (typeof input.hostPeerId !== 'string' || input.hostPeerId.length === 0 || input.hostPeerId.length > 256) {
    return 'hostPeerId 必须是 1-256 字符';
  }
  if (typeof input.title !== 'string') return 'title 必须是字符串';
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length === 0 || trimmedTitle.length > 80) return 'title 必须是 1-80 字符';
  if (typeof input.packageName !== 'string' || input.packageName.length === 0 || input.packageName.length > 120) {
    return 'packageName 必须是 1-120 字符';
  }
  if (!Number.isInteger(input.playerCount) || input.playerCount < 0) {
    return 'playerCount 必须是非负整数';
  }
  if (input.maxPlayers !== null && (!Number.isInteger(input.maxPlayers) || input.maxPlayers <= 0)) {
    return 'maxPlayers 必须是正整数或 null';
  }
  if (typeof input.joinable !== 'boolean') return 'joinable 必须是布尔';
  if (typeof input.credentialRequired !== 'boolean') return 'credentialRequired 必须是布尔';
  if (input.metadata !== undefined) {
    if (typeof input.metadata !== 'object' || input.metadata === null || Array.isArray(input.metadata)) {
      return 'metadata 必须是对象';
    }
    if (JSON.stringify(input.metadata).length > 8 * 1024) {
      return 'metadata 不能超过 8 KiB';
    }
  }
  return null;
}

function makeEntry(input, listingId, createdAt) {
  return {
    listingId,
    roomId: input.roomId,
    hostPeerId: input.hostPeerId,
    title: input.title.trim(),
    packageName: input.packageName,
    playerCount: input.playerCount,
    maxPlayers: input.maxPlayers,
    joinable: input.joinable,
    credentialRequired: input.credentialRequired,
    metadata: input.metadata,
    createdAt,
    updatedAt: createdAt,
    expiresAt: createdAt + LEASE_TTL_MS,
  };
}

function cleanExpired() {
  const cutoff = now();
  let removed = 0;
  for (const [listingId, record] of listings) {
    if (record.entry.expiresAt <= cutoff) {
      listings.delete(listingId);
      removed += 1;
    }
  }
  if (removed > 0) persistAsync();
}

const server = createHttpServer(async (req, res) => {
  res.req = req;
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // OPTIONS 预检 + 所有非 /v1/health 都走 Origin 白名单（生产）。
    if (req.method === 'OPTIONS') {
      if (rejectIfOriginNotAllowed(req, res)) return;
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }
    if (url.pathname !== '/v1/health' && rejectIfOriginNotAllowed(req, res)) return;

    if (req.method === 'GET' && url.pathname === '/v1/health') {
      sendJson(res, 200, { ok: true, version: 1 });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/rooms') {
      cleanExpired();
      const rooms = [];
      for (const { entry } of listings.values()) {
        if (!isExpired(entry)) rooms.push(entry);
      }
      sendJson(res, 200, { rooms });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/rooms') {
      const body = await readJsonBody(req);
      const error = validateInput(body);
      if (error) return sendError(res, 422, 'INVALID_INPUT', error);
      const listingId = `listing_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const createdAt = now();
      const entry = makeEntry(body, listingId, createdAt);
      listings.set(listingId, { token: randomToken(), entry });
      persistAsync();
      sendJson(res, 201, {
        listingId,
        leaseToken: listings.get(listingId).token,
        expiresAt: entry.expiresAt,
      });
      return;
    }

    const patchMatch = url.pathname.match(/^\/v1\/rooms\/([^/]+)$/);
    if (patchMatch) {
      const listingId = patchMatch[1];
      cleanExpired();
      const record = listings.get(listingId);
      if (!record) return sendError(res, 404, 'NOT_FOUND', '条目不存在或已过期');

      const auth = req.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token || token !== record.token) {
        return sendError(res, 401, 'UNAUTHORIZED', '租约令牌缺失或不正确');
      }

      if (req.method === 'PATCH') {
        const body = await readJsonBody(req);
        const error = validateInput(body);
        if (error) return sendError(res, 422, 'INVALID_INPUT', error);
        const updatedAt = now();
        record.entry = {
          ...makeEntry(body, listingId, record.entry.createdAt),
          createdAt: record.entry.createdAt,
          updatedAt,
          expiresAt: updatedAt + LEASE_TTL_MS,
        };
        persistAsync();
        sendJson(res, 200, {
          listingId,
          leaseToken: record.token,
          expiresAt: record.entry.expiresAt,
        });
        return;
      }

      if (req.method === 'DELETE') {
        listings.delete(listingId);
        persistAsync();
        res.writeHead(204, corsHeaders(req));
        res.end();
        return;
      }
    }

    sendError(res, 404, 'NOT_FOUND', `未知路径 ${req.method} ${url.pathname}`);
  } catch (error) {
    const status = error?.status ?? 500;
    const code = error?.code ?? 'INTERNAL';
    sendError(res, status, code, error?.message ?? 'Internal error');
  }
});

// Node 22+ 自带 globalThis.crypto，Node 18 也支持；这里不显式判断。

server.listen(PORT, HOST, () => {
  const banner = IS_PRODUCTION ? '[lobby-mock][prod]' : '[lobby-mock][dev]';
  console.log(`${banner} listening on http://${HOST}:${PORT}`);
  if (STORAGE_FILE) console.log(`${banner} persistence: ${STORAGE_FILE}`);
  if (ALLOWED_ORIGINS.length > 0) {
    console.log(`${banner} CORS allow-list: ${ALLOWED_ORIGINS.join(', ')}`);
  } else {
    console.log(`${banner} CORS: ANY origin (开发模式或未设置 ALLOWED_ORIGINS，生产部署请务必设置)`);
  }
  console.log(`${banner} try: curl http://${HOST}:${PORT}/v1/health`);
});

function shutdown(signal) {
  console.log(`[lobby-mock] received ${signal}, flushing and exiting…`);
  persistSync();
  server.close(() => process.exit(0));
  // 兜底 2s 强退。
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
