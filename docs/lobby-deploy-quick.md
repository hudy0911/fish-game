# 大厅 10 分钟部署（Docker）

把整套 Web + 大厅后端打包成**一个 Docker 镜像**。`docker run` 一条命令就起，
配套 Caddy 自动签 HTTPS。适合**不想装 Node / pnpm / systemd** 的人。

镜像里只跑 `scripts/start.mjs` 一个进程：对外服务 `apps/web/dist/`，反代
`/v1/*` 到内置的 lobby-mock 子进程，并把房间列表持久化到一个挂载卷。

## 1. 准备一台 Linux VPS + 域名

任意 Ubuntu 22.04 / Debian 12，1 核 1G 内存就够。  
准备一个**域名**（下文用 `lobby.example.com`），先把 DNS A 记录指到 VPS 公网 IP。

## 2. 在 VPS 上装 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 重新登录 shell 让 docker 组生效
```

## 3. 构建并启动容器

```bash
# 把代码拉到 VPS 上（任选一种方式：git clone / scp / rsync）
git clone https://github.com/<你的fork>/fish-game.git
cd fish-game

docker build -t fish-lobby .

docker run -d \
  --name fish-lobby \
  --restart unless-stopped \
  -p 127.0.0.1:5157:5157 \
  -e ALLOWED_ORIGINS=https://lobby.example.com \
  -e VITE_LOBBY_SERVICE_URL=https://lobby.example.com \
  -v fish-data:/data \
  fish-lobby
```

含义：
- `-p 127.0.0.1:5157:5157` — 只暴露给本机（外层 Caddy 再反代）
- `ALLOWED_ORIGINS` — 允许调用大厅 API 的 Web 来源，**必填**
- `VITE_LOBBY_SERVICE_URL` — Web 端要连的大厅地址，**会写进镜像构建期**（见第 4 步）
- `-v fish-data:/data` — 房间列表持久化到命名卷，重启/升级不丢

查状态：

```bash
docker ps
docker logs -f fish-lobby
```

看到 `[start] listening on http://0.0.0.0:5157` 就是 OK。

## 4. 一个容易踩的坑：Web 端 URL 是**构建期**写进 bundle 的

`VITE_LOBBY_SERVICE_URL` 不会在容器启动时生效——它会在前端 build 时被 Vite
打包进静态文件。所以**改 URL 必须重新 `docker build`**：

```bash
docker build -t fish-lobby . --build-arg VITE_LOBBY_SERVICE_URL=https://lobby.example.com
```

> 在 `Dockerfile` 里把 `VITE_LOBBY_SERVICE_URL` 写成 `ARG` 即可让 `docker build
> --build-arg` 覆盖；当前默认直接读 `apps/web/.env.production`。
> 你想用 build-arg 模式，告诉我，我把 Dockerfile 改一版。

## 5. 套 HTTPS（Caddy 自动签证书）

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
lobby.example.com {
    reverse_proxy 127.0.0.1:5157
}
EOF
sudo systemctl reload caddy
```

Caddy 会自动申请并续期 Let's Encrypt 证书。访问 `https://lobby.example.com`
看到 Web 页面就是通了。

## 6. 升级

```bash
cd fish-game
git pull
docker build -t fish-lobby .
docker rm -f fish-lobby
docker run -d --name fish-lobby --restart unless-stopped \
  -p 127.0.0.1:5157:5157 \
  -e ALLOWED_ORIGINS=https://lobby.example.com \
  -v fish-data:/data \
  fish-lobby
```

> 命名卷 `fish-data` 不会被 `docker rm` 删除，房间列表保留。

## 7. 备份与恢复

```bash
# 备份
docker run --rm -v fish-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/lobby-backup.tgz /data

# 恢复
docker run --rm -v fish-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/lobby-backup.tgz -C /
```

## 常用命令

| 操作 | 命令 |
| --- | --- |
| 看实时日志 | `docker logs -f fish-lobby` |
| 重启容器 | `docker restart fish-lobby` |
| 停 | `docker stop fish-lobby` |
| 删容器（保留数据卷） | `docker rm -f fish-lobby` |
| 进 shell 排查 | `docker exec -it fish-lobby sh` |
| 健康检查 | `curl http://127.0.0.1:5157/v1/health` |

## 端口

- **5157** — 对外（Web + `/v1/*`），Caddy 反代到 `127.0.0.1:5157`
- **5158** — 大厅 mock 内部端口，**只在容器内**，不要 expose

## 遇到问题

| 现象 | 排查 |
| --- | --- |
| 浏览器调不到 `/v1/*` | 99% 是 `ALLOWED_ORIGINS` 没设对，看 `docker logs` 里 `[start] CORS allow:` |
| 改了 `VITE_LOBBY_SERVICE_URL` 不生效 | 必须**重新 `docker build`**，镜像里的 bundle 是构建时定的 |
| 容器起不来：`Cannot find module 'tsx'` | 镜像构建阶段没拷贝 `node_modules`，看 `Dockerfile` 的 `COPY --from=builder` |
| 房间列表重启没了 | 检查 `-v fish-data:/data` 是否挂上（`docker inspect fish-lobby` 看 `Mounts`） |
| 镜像特别大 | 当前 `node_modules` 全拷，~700MB。要瘦身可以告诉我换成 production 模式 + 全转 .js |
