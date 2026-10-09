# 多阶段：先在 builder 装依赖、构建 Web；再裁到只跑 start.mjs 的 runtime。
# 镜像内只有一个 node 进程做 3 件事：服务 apps/web/dist + 反代 /v1/* 到 lobby-mock 子进程 + 持久化。

# ── 1. 构建阶段 ───────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

# pnpm + 离线安装锁定的依赖
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

WORKDIR /app

# 先复制 lockfile + package.json，最大化缓存命中
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
# 其余 workspace package.json
COPY apps ./apps

# 安装 + 构建 Web 端（不需要构建 Room app）
RUN pnpm install --frozen-lockfile
RUN pnpm build:web

# ── 2. 运行阶段 ───────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=5157 \
    HOST=0.0.0.0 \
    LOBBY_INTERNAL=5158 \
    STORAGE_FILE=/data/lobby.json \
    STATIC_DIR=/app/apps/web/dist

WORKDIR /app

# 单独安装生产依赖（这里 start.mjs 用了 tsx，因此保留 devDependencies）
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules

# 健康检查要 wget，slim 镜像默认没有
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 数据卷：房间列表持久化挂到这里
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 5157

# 健康检查走对外端口的健康端点（由 start.mjs 暴露）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5157/v1/health || exit 1

# 不直接用 start 脚本（tsx 启动有命令前缀），用 node 显式调用
CMD ["node", "--import", "tsx", "scripts/start.mjs"]
