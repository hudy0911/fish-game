# 大厅后端生产部署

项目内自带一个**轻量、生产可用**的大厅服务：`scripts/lobby-mock.mjs`。本仓库的
"mock" 不是"开发期假实现"——它实现了 [lobby-service.md](./lobby-service.md) 的全
部契约（GET /v1/health、GET/POST/PATCH/DELETE /v1/rooms、60s 租约、leaseToken 鉴
权、CORS、`LobbyRoomInput` 校验），并支持文件持久化、CORS 白名单、优雅退出。

也就是说：**项目不需要 Supabase 即可在公网运行"公开到大厅"功能**。

本文说明怎么把整套（Web 打包产物 + 大厅后端）一次性部署到一台 Linux 云服务器。

## 1. 部署原理

`pnpm start` 启动 `scripts/start.mjs`，**同进程内**做了三件事：

```
┌─────────────── PORT=5157 (公开) ───────────────┐
│  scripts/start.mjs                             │
│                                                │
│   /v1/*  ──▶  反代到 127.0.0.1:5158            │
│   其它   ──▶  serve apps/web/dist/ + SPA fallback│
└─────────────────────┬──────────────────────────┘
                      │ spawn 子进程
                      ▼
          ┌──────────────────────┐
          │ scripts/lobby-mock   │  0.0.0.0:127.0.0.1:5158
          │ + data/lobby.json    │  ← 持久化
          └──────────────────────┘
```

外部 HTTPS 由 Nginx/Caddy 反代完成（见第 5 节）。

## 2. 服务端准备工作

最低要求：任意一台 Linux VPS（Ubuntu 22.04 / Debian 12 即可），1 核 1G 内存就够了。

```bash
# 安装 Node.js 20+（Ubuntu/Debian）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pnpm
corepack enable
corepack prepare pnpm@10.15.1 --activate

# 安装 git（拉代码用）
sudo apt install -y git
```

## 3. 拉代码并构建

```bash
git clone <your-fork-url> fish-game
cd fish-game
pnpm install --frozen-lockfile

# 仅构建 Web 端（房间 app 通常不用跑，部署到大厅时是 Web 用户在玩）
pnpm build:web
```

构建后 `apps/web/dist/` 就是静态产物。

## 4. 启动

### 临时启动（调试）

```bash
ALLOWED_ORIGINS=https://lobby.example.com PORT=5157 \
  LOBBY_STORAGE_FILE=/var/lib/fish-game/lobby.json \
  node scripts/start.mjs
```

输出类似：

```
[start] listening on http://0.0.0.0:5157
[start] lobby storage: /var/lib/fish-game/lobby.json
[start] CORS allow: https://lobby.example.com
[start] static dir: .../apps/web/dist
[start] lobby API on /v1/*
```

### 守护进程（systemd）

把 `deploy/lobby.service` 拷到 `/etc/systemd/system/lobby.service`，然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lobby
sudo systemctl status lobby
journalctl -u lobby -f
```

## 5. 套 HTTPS（Caddy，最简方案）

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`：

```
lobby.example.com {
    reverse_proxy 127.0.0.1:5157
}
```

```bash
sudo systemctl reload caddy
```

Caddy 会自动签发并续期 Let's Encrypt 证书。

如果你已经有 Nginx，把 `lobby.example.com` 反代到 `127.0.0.1:5157` 即可。

## 6. Web 端怎么连上

把 `apps/web/.env.production`（或部署平台环境变量）写：

```dotenv
VITE_LOBBY_SERVICE_URL=https://lobby.example.com
```

然后重新 `pnpm build:web`，重新跑 `pnpm start`。

> 注意：构建期把 URL 编译进 bundle。换 URL 必须重新构建。

## 7. 关键环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `5157` | start.mjs 对外端口 |
| `HOST` | `0.0.0.0` | 绑定地址 |
| `LOBBY_INTERNAL` | `5158` | mock 子进程端口（用户不应访问） |
| `LOBBY_STORAGE_FILE` | `data/lobby.json` | 持久化文件，默认写到 `./data/lobby.json`（`data/` 在 .gitignore 不会入仓）。生产部署可设 `/var/lib/.../lobby.json` |
| `ALLOWED_ORIGINS` | （空，全开） | 逗号分隔的 Web Origin 列表。**生产必填** |
| `STATIC_DIR` | `apps/web/dist` | start.mjs 服务的静态目录 |

mock 自身也有相同的环境变量（`PORT`、`HOST`、`STORAGE_FILE`、`ALLOWED_ORIGINS`），
单独跑 `node scripts/lobby-mock.mjs` 时生效。

## 8. 运维

- **日志**：`journalctl -u lobby -f`
- **重启**：`sudo systemctl restart lobby`
- **数据备份**：备份 `LOBBY_STORAGE_FILE` 指向的文件。**冷启动**会自动读回。
- **升级**：拉新代码 → `pnpm install --frozen-lockfile` → `pnpm build:web` → `sudo systemctl restart lobby`
- **持久化丢失容忍**：60s 租约 + 客户端 20s 心跳 → 丢最坏也只丢 <1 分钟的房间列表

## 9. 什么时候这套不够用

- **用户量超过单机**：并发写入 > 几百 qps（极小概率），持久化是单文件 JSON。
  升级路径：换 SQLite（`better-sqlite3`）或接 Postgres。协议无需变。
- **多地域**：`pnpm start` 启动的是单实例。多地域要换成共享后端（Supabase / Redis）。
  **本次发布不要走这条线**。
