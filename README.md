# PCB Hover Viewer

在线查看手机主板并进行“hover 关系高亮”的 Web 应用。

## 技术栈
- Next.js（App Router）
- TypeScript
- SQLite3 + Prisma
- Zustand
- （可选）PixiJS

## 核心能力（当前实现）
- 板卡列表/元信息 API
- 元件与走线几何 API
- 关系查询 API（component -> direct/net/trace）
- 板卡查看页 `/board/[id]`
- **互联网默认示例页 `/examples`（Python 抓取并预处理）**
- Hover 元件联动高亮：
  - 目标元件高亮
  - 直接关联元件高亮
  - 关联 Trace 高亮
- 关系侧边栏信息展示

## 快速开始
```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

打开：`http://localhost:3000/board/iphone-mainboard-demo`

## 目录结构
```text
app/
  api/boards/...        # API 路由
  board/[id]/page.tsx   # 查看器页面
components/
  BoardViewerClient.tsx
  PcbCanvas.tsx
lib/
  prisma.ts
  api.ts
prisma/
  schema.prisma
  seed.ts
store/
  viewerStore.ts
types/
  pcb.ts
```

## 架构文档
- `docs/ARCHITECTURE.md`
