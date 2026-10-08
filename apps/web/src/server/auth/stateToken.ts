/**
 * CSRF state 生成 / 校验。
 * state 同时承担两件事：
 *   1) 防 CSRF：随机不可预测
 *   2) 在 callback 时回传 next 跳转目标
 *
 * 使用 HMAC-SHA256 签名 + base64url 编码，便于放在 URL 里。
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

interface StateClaims {
  nonce: string;
  next: string;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(text: string): Buffer {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function sign(payload: string, secret: string): string {
  return b64urlEncode(createHmac('sha256', secret).update(payload).digest());
}

export function createState(secret: string, next: string): string {
  const claims: StateClaims = {
    nonce: randomBytes(16).toString('hex'),
    next,
  };
  const payload = b64urlEncode(Buffer.from(JSON.stringify(claims), 'utf8'));
  return `${payload}.${sign(payload, secret)}`;
}

/** 校验成功返回 claims；失败抛 Error。 */
export function verifyState(token: string, secret: string): StateClaims {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('state 格式非法');
  const [payload, signature] = parts;
  if (!payload || !signature) throw new Error('state 格式非法');
  const expected = sign(payload, secret);
  const actual = b64urlDecode(signature);
  const expectedBuf = b64urlDecode(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    throw new Error('state 签名不匹配');
  }
  let claims: StateClaims;
  try {
    claims = JSON.parse(b64urlDecode(payload).toString('utf8')) as StateClaims;
  } catch {
    throw new Error('state payload 解码失败');
  }
  if (typeof claims.nonce !== 'string' || typeof claims.next !== 'string') {
    throw new Error('state payload 字段缺失');
  }
  return claims;
}