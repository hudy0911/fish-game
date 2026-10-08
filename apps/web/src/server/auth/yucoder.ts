/**
 * 封装摸鱼岛 OAuth2 token / userinfo 接口调用。
 * 失败一律抛 Error，message 是面向开发者的英文描述。
 */
import { YUCODER_API_BASE, type FishUserInfo } from './types.js';

interface TokenResponseData {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface Envelope<T> {
  code: number;
  data: T;
  message?: string;
}

export async function exchangeCodeForToken(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenResponseData> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  const response = await fetch(`${YUCODER_API_BASE}/api/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString(),
  });
  if (!response.ok) {
    throw new Error(`token 换取失败 (HTTP ${response.status})`);
  }
  const json = (await response.json()) as Envelope<TokenResponseData>;
  if (json.code !== 0 || !json.data?.access_token) {
    throw new Error(`token 换取失败: ${json.message ?? `code=${json.code}`}`);
  }
  return json.data;
}

export async function fetchUserInfo(accessToken: string): Promise<FishUserInfo> {
  const response = await fetch(`${YUCODER_API_BASE}/api/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`userinfo 获取失败 (HTTP ${response.status})`);
  }
  const json = (await response.json()) as Envelope<FishUserInfo>;
  if (json.code !== 0 || !json.data?.id) {
    throw new Error(`userinfo 失败: ${json.message ?? `code=${json.code}`}`);
  }
  return json.data;
}