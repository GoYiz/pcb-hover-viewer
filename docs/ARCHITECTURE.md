# PCB Hover Viewer 架构设计文档（Next.js + SQLite 方案）

## 1. 文档目的

本设计文档用于定义“在线查看手机主板并在 hover 时联动高亮关系对象”的系统架构、技术选型、数据模型与实施路径。

本版采用推荐方案：
- **前后端统一：Next.js（App Router）**
- **数据库：SQLite3（MVP 与中早期阶段）**
- **可选 Python：仅用于离线预处理，不作为在线主后端**

---

## 2. 产品目标与范围

## 2.1 目标
- 在桌面浏览器高性能展示主板图形
- 鼠标 hover 元件/线路时，自动高亮相关元件、引脚、走线
- 提供可理解的关系动画（目标、直接关系、间接关系）
- 提供检索与信息面板（RefDes、Net、功能分组）

## 2.2 当前范围（In Scope）
- 桌面端 Web
- 主板浏览（缩放、平移、图层开关）
- Hover 关系高亮
- 基础搜索和详情面板
- SQLite 数据存储

## 2.3 非范围（Out of Scope）
- 移动端交互适配
- 在线编辑/布线
- 复杂权限系统与多租户

---

## 3. 技术选型与取舍

## 3.1 核心选型
- **Web 框架：Next.js + TypeScript**
- **数据库：SQLite3 + Prisma（或 Drizzle）**
- **前端渲染：PixiJS（WebGL 2D）**
- **状态管理：Zustand**
- **动画：GSAP（或 Shader 动画）**

## 3.2 为什么优先 Next.js API 而不是 Python 主后端
- 当前在线接口主要是：查询、筛选、关系返回、搜索
- 这些逻辑在 Next.js API Route / Route Handler 中可直接实现
- 同栈开发效率高，部署链路简单

## 3.3 Python 的合理位置
Python **不做主 API 服务**，仅在需要时负责：
- EDA/Gerber 数据预处理
- 几何清洗与关系索引离线生成
- 批处理任务（可由 CLI/定时任务执行）

结论：
- **线上服务：Next.js 全栈即可**
- **离线处理复杂时：引入 Python 工具链**

---

## 4. 总体架构

采用“离线处理 + 在线查询渲染”模式：

1. **数据导入层（可选 Python/Node 脚本）**
   - 输入：Gerber/Netlist/BOM/标注
   - 输出：标准化结构数据 + 关系索引
2. **应用服务层（Next.js）**
   - Route Handlers 提供查询 API
   - Server Components / Client Components 组合渲染
3. **数据层（SQLite）**
   - 存储 board/component/net/trace/relation 元数据
4. **可视化层（Next.js 前端 + PixiJS）**
   - 图形渲染、hover 命中、联动高亮、动画

---

## 5. 数据模型设计（SQLite）

> 推荐通过 Prisma 管理迁移。

## 5.1 核心表

### boards
- id (TEXT, PK)
- name (TEXT)
- version (TEXT)
- width_mm (REAL)
- height_mm (REAL)
- created_at (DATETIME)

### layers
- id (TEXT, PK)
- board_id (TEXT, FK -> boards.id)
- name (TEXT)  // TOP, BOTTOM, INNER1...
- z_index (INTEGER)

### components
- id (TEXT, PK)           // U1200
- board_id (TEXT, FK)
- refdes (TEXT)
- footprint (TEXT)
- x (REAL)
- y (REAL)
- rotation (REAL)
- bbox_json (TEXT)

### pins
- id (TEXT, PK)           // U1200.1
- component_id (TEXT, FK -> components.id)
- net_id (TEXT, FK -> nets.id)
- x (REAL)
- y (REAL)
- layer_id (TEXT, FK -> layers.id)

### nets
- id (TEXT, PK)           // PP_VDD_MAIN
- board_id (TEXT, FK)
- net_name (TEXT)

### traces
- id (TEXT, PK)
- board_id (TEXT, FK)
- net_id (TEXT, FK)
- layer_id (TEXT, FK)
- path_json (TEXT)        // polyline points
- width (REAL)

### relation_edges
- id (TEXT, PK)
- board_id (TEXT, FK)
- source_type (TEXT)      // component/net/trace
- source_id (TEXT)
- target_type (TEXT)
- target_id (TEXT)
- relation_type (TEXT)    // electrical/functional/adjacent
- weight (REAL)

## 5.2 索引建议
- components(board_id, refdes)
- pins(component_id), pins(net_id)
- traces(board_id, net_id)
- relation_edges(board_id, source_type, source_id)

---

## 6. API 设计（Next.js Route Handlers）

## 6.1 路由清单
- `GET /api/boards`
- `GET /api/boards/:id/meta`
- `GET /api/boards/:id/layers`
- `GET /api/boards/:id/components?search=U12`
- `GET /api/boards/:id/nets/:netId`
- `GET /api/boards/:id/geometry?layer=TOP`
- `GET /api/boards/:id/relations/:featureType/:featureId`

## 6.2 关系查询返回示例
```json
{
  "target": { "type": "component", "id": "U1200" },
  "direct": {
    "components": ["C1201", "L1200"],
    "nets": ["PP_VDD_MAIN"],
    "traces": ["T991", "T992"]
  },
  "indirect": {
    "components": ["R1202"],
    "nets": ["PP_VDD_AON"]
  }
}
```

---

## 7. 前端架构（Next.js + PixiJS）

## 7.1 模块划分
- `app/(viewer)/board/[id]/page.tsx`：主页面
- `components/viewer/CanvasStage.tsx`：渲染入口
- `components/viewer/layers/*`：图层渲染器
- `components/viewer/highlight/*`：高亮与动画
- `lib/picking/*`：命中检测
- `lib/relation/*`：关系请求与缓存
- `store/viewerStore.ts`：状态管理

## 7.2 状态结构（简化）
- boardId
- activeLayers
- hoveredFeature
- selectedFeature
- highlightSet { target/direct/indirect }
- relationMode (electrical/functional/all)

---

## 8. Hover 联动高亮实现方案

## 8.1 命中检测
可选两种：
1. **Color Picking（推荐）**：离屏渲染唯一颜色 ID
2. R-Tree + 几何计算（实现简单，复杂度更高）

## 8.2 交互流程
1. pointermove 获取 featureId
2. 若 feature 变化，调用 `/relations/...`
3. 更新 highlightSet
4. 渲染层根据层级应用不同样式

## 8.3 视觉策略
- target：高亮描边 + 强发光
- direct：中强度高亮 + 流光动画
- indirect：低强度静态高亮

---

## 9. 性能与扩展策略

- 首屏先加载元数据与当前层简化几何
- geometry 与 relations 分请求加载
- 关系查询结果缓存（LRU）
- 事件节流（hover 每 16~32ms）
- 大板按 tile 分片 + 按层懒加载
- 若数据超大，新增 `/geometry/tile` 接口

---

## 10. 开发里程碑

## M1（Week 1-2）
- Next.js 项目初始化
- SQLite + Prisma schema
- Viewer 基础（缩放/平移/图层）
- component hover + electrical direct 高亮

## M2（Week 3-4）
- relation_edges 全关系接入
- 动画高亮效果
- 搜索与定位
- 右侧信息面板

## M3（Week 5-6）
- 性能优化（tile/cache）
- 数据导入管线（可选 Python）
- 部署与监控

---

## 11. 风险与应对

1. **数据源不规整**：先定义标准中间格式，再入库
2. **大数据卡顿**：WebGL + 分片 + 缓存 + 节流
3. **关系不准确**：支持人工标注校正与版本化
4. **SQLite 并发限制**：读多写少可接受；后期可迁移 PostgreSQL

---

## 12. 迁移与演进路线

当前：Next.js + SQLite（快速交付）
未来：
- 数据量增长 -> PostgreSQL
- 计算复杂增长 -> 后台任务队列（Node Worker 或 Python Worker）
- 多人协作 -> 权限系统与审计日志

---

## 13. 结论

本项目采用 **Next.js 全栈 + SQLite** 是当前阶段最优解：
- 开发快、部署简、维护成本低
- 足以支撑“hover 联动高亮”的主流程
- 保留 Python 作为离线预处理工具链即可，无需作为在线主后端
