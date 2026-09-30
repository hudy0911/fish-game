# Parti 大富翁

Parti Room 的快节奏多人地产经营游戏。V1 规则：2–6 人、32 格地图、6 个城区、20 轮净资产决胜，融合公开拍卖、区域股票、策略卡、交易、岔路移动与破产救助。

## 核心规则

- 初始现金：15,000；每人随机 2 张策略卡。
- 无主地产可购买；放弃后立即公开拍卖，所有未放弃玩家都能竞价。
- 地产 Lv1–Lv4；升级会提高租金与资产价值，并令所属城区股价 +15。
- 同一区持有 1 块租金 ×1、至少 2 块 ×1.5、全套 ×2。
- 经过中央银行获得 1,500；经过或落在银行可在当前经营阶段买卖股票。
- 破产会清空地产、股票和卡牌，记录 1 个破产标记并休整 1 回合；休整结束获得 5,000 救助金。每个破产标记最终净资产 -3,000。
- 第 20 轮结束后，按 `现金 + 地产当前价值 + 股票市值 - 破产惩罚` 排名。
- 若某玩家净资产达到 50,000 且领先第二名至少 15,000，则立即获胜。

## 技术结构

- `src/worker/index.ts`：全部权威规则与随机结果。
- `src/ui/main.ts` + `style.css`：Parti 注入式客户端 UI，只提交 action 并渲染 snapshot。
- `public/parti.room.json`：Room manifest。
- `vite.config.ts`：Vite UI 构建 + esbuild 单文件 Worker 构建；Worker 保留 `@parti/worker-sdk` runtime import。

## 开发

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

若接入 Parti monorepo Harness：

```bash
npm run dev:room
npm run build:room
```

Harness 模式需要 Parti 提供 `PARTI_ROOM_DEV_OUT_DIR` / `PARTI_ROOM_BUILD_OUT_DIR`。

## 本地无依赖验证

开发环境若暂时没有 Vite/esbuild 依赖，可使用系统 TypeScript 做等价构建与 Worker 烟测：

```bash
npm run validate:local
```

结果输出到 `dist-local/`。正式发布以 `npm run build` 的 Vite/esbuild 产物为准。

## Parti 市场

市场安装源使用 `parti-package` 分支。该分支保存完整可安装的 Room 包，并通过 `glink25/Parti` 的 `[parti-room]` issue 注册到房间市场。
