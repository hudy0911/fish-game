/**
 * @parti/api 共享类型与常量。
 * 前端 (apps/web) 通过 window.fetch 直接访问 /api/auth/moyu/*，
 * 路径由 Vite 中间件插件直接挂在本服务（与 SPA 同源）。
 */

export interface FishUserInfo {
  /** 摸鱼岛稳定用户 id (string). */
  id: string;
  username: string;
  name: string;
  avatar?: string;
}

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  /** 注册应用时声明的回调地址，必须与摸鱼岛后台一致 */
  redirectUri: string;
  /** 默认用逗号拼接，可覆盖，例如空格分隔 */
  scope?: string;
  /** state 加密密钥，用来签发 / 校验 CSRF token */
  stateSecret: string;
  /** express-session 签名密钥 */
  sessionSecret: string;
}

export interface AppConfig {
  /** Web 应用对外的端口（同源部署时为 5157） */
  port: number;
  /** 允许从浏览器访问的后端端口（同源部署时与 Web 服务一致） */
  publicBaseUrl?: string;
  oauth2: OAuth2Config;
}

export const YUCODER_AUTHORIZE_URL = 'https://yucoder.cn/oauth2/authorize';
export const YUCODER_API_BASE = 'https://api.yucoder.cn';

/** 配置错误：在启动时打出来立即退出 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}