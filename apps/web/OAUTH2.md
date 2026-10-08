# OAuth2 接入（摸鱼岛）

OAuth2 路由现在与 Vite 同进程挂载：dev/preview 都只对外暴露一个端口（5157）。
代码位于 [`src/server/auth/`](./src/server/auth)，由 [`vite.config.ts`](./vite.config.ts) 中的 `authMiddlewarePlugin()` 接入。

## 路由

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/auth/moyu/login?next=/path` | 返回 `{"url":"https://yucoder.cn/oauth2/authorize?..."}` |
| GET | `/api/auth/moyu/callback?code=&state=` | 处理摸鱼岛回调，写 session |
| GET | `/api/auth/moyu/me` | 返回 `{"user": null \| FishUser}`，未登录 401 |
| POST | `/api/auth/moyu/logout` | 清 session |

## 启动

```bash
# 一次性配齐（任选其一）
cp config.example.json config.local.json
# 或设置环境变量：
export PARTI_OAUTH2_CLIENT_ID=fish_xxx
export PARTI_OAUTH2_CLIENT_SECRET=xxx
export PARTI_OAUTH2_STATE_SECRET=$(openssl rand -hex 32)
export PARTI_OAUTH2_SESSION_SECRET=$(openssl rand -hex 32)

# 单端口启动（Vite dev server 已内置 OAuth2 中间件）
pnpm --filter @parti/web dev --host
```

监听端口默认 `5157`，与 Vite 一致；可通过 `PARTI_WEB_PORT` 覆盖。

## 回调地址

默认 `redirect_uri` 为 `http://localhost:5157/api/auth/moyu/callback`，与 Vite dev server 同源。
生产/HTTPS：把 `src/server/auth/authApp.ts` 里 `cookie.secure` 改成 `true`，并在摸鱼岛后台把回调改为 `https://your-host/api/auth/moyu/callback`，同时通过 `PARTI_OAUTH2_REDIRECT_URI` 显式覆盖。