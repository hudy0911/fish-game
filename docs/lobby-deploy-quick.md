# 大厅 10 分钟部署

把整套 Web + 大厅后端 **从零** 部署到一台 Linux VPS，并套上 HTTPS。  
只跑一条 `pnpm start` 就完事——Web 静态 + 大厅 API + 持久化全在一个进程里。

## 1. 准备一台 Linux VPS

任意 Ubuntu 22.04 / Debian 12，1 核 1G 内存就够。

```bash
# 装 Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt update && sudo apt install -y nodejs git

# 装 pnpm
corepack enable
corepack prepare pnpm@10.15.1 --activate
```

准备一个**域名**（下文用 `lobby.example.com`），先把 DNS A 记录指到 VPS 公网 IP。

## 2. 拉代码 + 构建

```bash
git clone https://github.com/<你的fork>/fish-game.git
cd fish-game
pnpm install --frozen-lockfile
pnpm build:web
```

## 3. 启动（调试模式先跑通）

```bash
ALLOWED_ORIGINS=https://lobby.example.com \
  node scripts/start.mjs
```

看到 `[start] listening on http://0.0.0.0:5157` 就是 OK。**Ctrl+C 退出。**

> `ALLOWED_ORIGINS` **必填**——是允许调用大厅 API 的 Web 来源（多个用逗号分隔）。

## 4. 套 HTTPS（Caddy 自动签证书）

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
lobby.example.com {
    reverse_proxy 127.0.0.1:5157
}
EOF
sudo systemctl reload caddy
```

Caddy 会自动申请并续期 Let's Encrypt 证书。访问 `https://lobby.example.com` 看到 Web 页面就是通了。

## 5. 配置 Web 端连大厅（生产 URL）

**这一步很容易漏。** Web 端在**构建期**就把大厅地址写进 bundle。

在 `apps/web/.env.production` 写：

```dotenv
VITE_LOBBY_SERVICE_URL=https://lobby.example.com
```

然后**重新构建并重启**：

```bash
pnpm build:web
```

> 这里只需要 `build:web`（只构建 Web 端），不要跑 `pnpm build`（会试图构建所有 Room 应用，部署机器上没那个必要）。

## 6. 配成 systemd 守护进程

```bash
sudo tee /etc/systemd/system/lobby.service > /dev/null <<'EOF'
[Unit]
Description=Fish Game Lobby
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/home/<你的用户>/fish-game
Environment=ALLOWED_ORIGINS=https://lobby.example.com
Environment=PORT=5157
Environment=LOBBY_STORAGE_FILE=/var/lib/fish-game/lobby.json
ExecStart=/usr/bin/node scripts/start.mjs
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo mkdir -p /var/lib/fish-game
sudo chown www-data:www-data /var/lib/fish-game
sudo systemctl daemon-reload
sudo systemctl enable --now lobby
sudo systemctl status lobby
```

`active (running)` 就是 OK。房间列表会持久化到 `/var/lib/fish-game/lobby.json`。

## 7. 升级

```bash
cd fish-game
git pull
pnpm install --frozen-lockfile
pnpm build:web
sudo systemctl restart lobby
```

## 常用命令

| 操作 | 命令 |
| --- | --- |
| 看实时日志 | `sudo journalctl -u lobby -f` |
| 重启 | `sudo systemctl restart lobby` |
| 停 | `sudo systemctl stop lobby` |
| 备份房间数据 | 拷贝 `LOBBY_STORAGE_FILE` 指向的文件 |
| 健康检查 | `curl http://127.0.0.1:5158/v1/health`（localhost 限定） |

## 端口

- **5157** — 对外（Web + `/v1/*`），Caddy 反代到这个端口
- **5158** — 大厅 mock 内部端口，**不要**对外暴露，不要改防火墙

## 遇到问题

| 现象 | 排查 |
| --- | --- |
| 浏览器调不到 `/v1/*` | 99% 是 `ALLOWED_ORIGINS` 没设对，看 `[start] CORS allow:` 那行 |
| 改了 `VITE_LOBBY_SERVICE_URL` 不生效 | 必须**重新 `pnpm build:web`** |
| `pnpm build:web` 报 `EACCES .../apps/web/config.local.json` | 这个文件不应在 server 端，删掉 |
| 房间列表重启没了 | 看 `lobby.service` 里 `LOBBY_STORAGE_FILE` 路径 + 目录 `chown` 给了 `www-data` |
