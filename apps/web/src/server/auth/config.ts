/**
 * 启动时从环境变量或 config.json 读取 OAuth2 配置。
 *
 * 优先级：
 *   1) 显式 PARTI_OAUTH2_CONFIG 指向的 JSON 文件（本地调试使用）
 *   2) 环境变量 (PARTI_OAUTH2_CLIENT_ID / PARTI_OAUTH2_CLIENT_SECRET / 等)
 *   3) apps/web/config.local.json（不进仓库）
 *
 * redirect_uri 未设置时使用 http://localhost:<PORT>/api/auth/moyu/callback，
 * 默认 PORT 与 Vite dev server 一致 (5157)，方便本地直接调试；部署时必须从配置覆盖。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { AppConfig } from './types.js';
import { ConfigError } from './types.js';

interface RawConfig {
  port?: number;
  publicBaseUrl?: string;
  oauth2?: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    scope?: string;
    stateSecret?: string;
    sessionSecret?: string;
  };
}

function readConfigFile(filePath: string): RawConfig {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as RawConfig;
  } catch (error) {
    throw new ConfigError(
      `无法读取配置文件 ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function loadRawConfig(): RawConfig {
  const filePath = process.env.PARTI_OAUTH2_CONFIG?.trim();
  if (filePath) {
    return readConfigFile(filePath);
  }
  // 默认尝试 apps/web/config.local.json（不进仓库）；
  // 文件可不存在，函数返回空对象即可。
  // 用 process.cwd() 而非 import.meta.url：vite plugin 在 esbuild 编译后 import.meta.url
  // 可能指向虚拟路径，从 process.cwd()（即 pnpm dev 启动的目录）出发更稳定。
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'apps', 'web', 'config.local.json'),
    path.join(cwd, 'config.local.json'),
  ];
  for (const candidate of candidates) {
    try {
      return readConfigFile(candidate);
    } catch {
      // 继续尝试下一个候选
    }
  }
  return {};
}

function pickString(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 默认端口与 Vite dev server 一致（同源部署）。 */
const DEFAULT_WEB_PORT = 5157;

export function loadConfig(): AppConfig {
  const raw = loadRawConfig();
  const env = process.env;
  const port = Number.parseInt(env.PARTI_WEB_PORT ?? env.PARTI_API_PORT ?? '', 10) ||
    (raw.port ?? DEFAULT_WEB_PORT);

  const oauth2Raw = raw.oauth2 ?? {};
  const clientId = pickString(env.PARTI_OAUTH2_CLIENT_ID) ?? pickString(oauth2Raw.clientId);
  const clientSecret =
    pickString(env.PARTI_OAUTH2_CLIENT_SECRET) ?? pickString(oauth2Raw.clientSecret);
  const explicitRedirect =
    pickString(env.PARTI_OAUTH2_REDIRECT_URI) ?? pickString(oauth2Raw.redirectUri);
  const stateSecret =
    pickString(env.PARTI_OAUTH2_STATE_SECRET) ?? pickString(oauth2Raw.stateSecret);
  const sessionSecret =
    pickString(env.PARTI_OAUTH2_SESSION_SECRET) ?? pickString(oauth2Raw.sessionSecret);
  const scope = pickString(env.PARTI_OAUTH2_SCOPE) ?? pickString(oauth2Raw.scope);

  if (!clientId) throw new ConfigError('缺少 OAuth2 clientId (PARTI_OAUTH2_CLIENT_ID 或 config.oauth2.clientId)');
  if (!clientSecret) {
    throw new ConfigError('缺少 OAuth2 clientSecret (PARTI_OAUTH2_CLIENT_SECRET 或 config.oauth2.clientSecret)');
  }
  if (!stateSecret || stateSecret.length < 16) {
    throw new ConfigError('OAuth2 stateSecret 必须至少 16 个字符 (config.oauth2.stateSecret)');
  }
  if (!sessionSecret || sessionSecret.length < 16) {
    throw new ConfigError('sessionSecret 必须至少 16 个字符 (config.oauth2.sessionSecret)');
  }

  return {
    port,
    publicBaseUrl: pickString(env.PARTI_WEB_PUBLIC_BASE) ?? pickString(raw.publicBaseUrl),
    oauth2: {
      clientId,
      clientSecret,
      redirectUri: explicitRedirect ?? `http://localhost:${port}/api/auth/moyu/callback`,
      scope: scope ?? 'read',
      stateSecret,
      sessionSecret,
    },
  };
}