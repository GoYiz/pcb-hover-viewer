# PCB 在线查看与关系高亮系统设计文档

## 1. 项目目标

构建一个面向桌面浏览器的在线电路板（手机主板）查看应用。用户将鼠标悬停在任意元件（Component）或线路（Trace）上时，系统实时高亮该对象及其关联对象，并通过动画强化连接关系的可读性。

### 1.1 核心目标
- 支持高性能加载与渲染复杂主板图形（多层、海量走线）
- 支持 hover 命中与关系联动高亮（< 50ms 交互反馈）
- 支持电气关系、功能关系、拓扑邻近关系
- 支持可扩展的数据导入与预处理管线
- 支持生产可维护的工程架构（前后端解耦）

### 1.2 非目标（当前阶段）
- 不实现移动端手势交互（后续可扩展）
- 不实现在线 PCB 编辑器
- 不实现全自动 EDA 文件逆向

---

## 2. 需求分析

## 2.1 用户故事
1. 作为维修工程师，我希望 hover 在 PMIC 上时，相关供电网络与关键外围器件自动高亮。
2. 作为硬件工程师，我希望 hover 在某条走线上时，快速定位该 Net 的全部连接点。
3. 作为学习者，我希望看到清晰的高亮动画，以理解元件之间的关系路径。

## 2.2 功能需求
- 板图浏览：缩放、平移、图层显示/隐藏
- 元件搜索：按 RefDes（如 U1200）定位
- Hover 高亮：
  - 主目标强高亮
  - 直接关系中高亮
  - 间接关系弱高亮（可配置）
- 动画：
  - 元件边缘发光
  - 线路流光方向动画
- 关系筛选：
  - 仅电气关系
  - 功能关系
  - 全关系
- 信息面板：展示元件属性、所属 Net、关联元件列表

## 2.3 非功能需求
- 首屏可交互时间：< 3s（中等规模板图）
- hover 响应延迟：目标 < 50ms
- 支持万级图元渲染（组件 + 走线 + 焊盘）
- 架构可横向扩展，支持多个板卡项目

---

## 3. 总体架构

采用“离线预处理 + 在线可视化”的分层架构：

1. **数据预处理层（Offline Pipeline）**
   - 输入：Gerber/ODB++/Netlist/BOM/人工标注
   - 输出：统一规范化 JSON + 索引文件
2. **数据服务层（API）**
   - 元数据、板图切片、关系图查询接口
3. **前端可视化层（Web App）**
   - 渲染引擎（WebGL/Canvas）
   - 命中检测（Picking）
   - 关系高亮与动画引擎
4. **存储层**
   - 对象存储（板图数据）
   - 数据库（板卡元信息、版本、标注）

---

## 4. 技术选型

## 4.1 前端
- 框架：React + TypeScript + Vite
- 渲染：PixiJS（2D WebGL）
- 状态管理：Zustand
- 动画：GSAP（或 shader 动画）
- 命中检测：
  - 方案 A：颜色编码 Picking FBO
  - 方案 B：空间索引（R-tree）+ 几何命中

## 4.2 后端
- API：FastAPI（Python）
- 数据处理脚本：Python（可结合 shapely/networkx）
- 缓存：Redis（可选）

## 4.3 数据存储
- 元数据：PostgreSQL
- 大文件与静态资源：S3 兼容对象存储
- CDN：用于板图 JSON 和 tile 分发

---

## 5. 数据模型设计

## 5.1 核心实体
- Board：板卡
- Layer：图层（TOP/BOTTOM/INNER）
- Component：元件（U/R/C/L）
- Pin：引脚
- Net：网络
- Trace：走线
- Via：过孔
- FunctionalGroup：功能模块（如充电电路）

## 5.2 关系模型
- Component 1-N Pin
- Pin N-1 Net
- Net 1-N Trace
- Net N-N Component（通过 Pin 映射）
- FunctionalGroup N-N Component/Net

## 5.3 推荐 JSON 结构（简化）
```json
{
  "board": { "id": "iphone_mainboard_x", "units": "mm" },
  "layers": [{ "id": "TOP", "visible": true }],
  "components": [{ "id": "U1200", "bbox": [0,0,1,1], "pins": ["U1200.1"] }],
  "pins": [{ "id": "U1200.1", "net": "PP_VDD_MAIN", "pos": [10.2, 5.7], "layer": "TOP" }],
  "nets": [{ "id": "PP_VDD_MAIN", "pins": ["U1200.1", "C1201.1"], "traces": ["T991"] }],
  "traces": [{ "id": "T991", "net": "PP_VDD_MAIN", "layer": "TOP", "path": [[1,1],[2,2]] }],
  "relations": {
    "U1200": {
      "direct_components": ["C1201", "L1200"],
      "nets": ["PP_VDD_MAIN"],
      "traces": ["T991"]
    }
  }
}
```

---

## 6. 关系高亮引擎设计

## 6.1 关系分级
- Level 0（目标对象）：当前 hover 对象
- Level 1（直接关系）：同 Net、同功能组
- Level 2（间接关系）：邻接一跳对象

## 6.2 查询流程
1. 接收 hover featureId
2. 查询关系索引 `featureId -> relationSet`
3. 生成高亮集合（主目标、直接、间接）
4. 触发渲染层样式变更与动画

## 6.3 动画规范
- 目标元件：外描边 + 呼吸发光
- 直接走线：亮度增强 + 流光动画
- 间接对象：低亮度静态高亮

---

## 7. 前端模块划分

- `viewer-core/`：渲染、坐标变换、图层管理
- `interaction/`：hover、selection、快捷键
- `relation-engine/`：关系查询与高亮集合计算
- `panels/`：右侧信息面板（属性/关系）
- `store/`：全局状态（board、layers、highlight）
- `api-client/`：请求封装与缓存

推荐目录：
```text
src/
  app/
  components/
  viewer/
    core/
    picking/
    highlight/
  relation/
  store/
  api/
  types/
```

---

## 8. API 设计（V1）

- `GET /api/boards`：板卡列表
- `GET /api/boards/{boardId}/meta`：板卡元数据
- `GET /api/boards/{boardId}/geometry?layer=TOP`：几何数据
- `GET /api/boards/{boardId}/graph`：关系索引
- `GET /api/boards/{boardId}/components/{id}`：元件详情
- `GET /api/boards/{boardId}/search?q=U12`：搜索

扩展（大板优化）：
- `GET /api/boards/{boardId}/tiles/{z}/{x}/{y}`

---

## 9. 性能优化策略

1. 几何数据分层分块加载（按 layer + tile）
2. 初始只加载可视层和低精度数据（LOD）
3. 关系图预编译为紧凑结构（TypedArray/bitset）
4. 使用 Web Worker 处理关系查询与重计算
5. 避免全量重绘：采用脏矩形/分层缓存
6. 交互事件节流（hover 频率控制）

---

## 10. 安全与权限

- 板图数据访问采用鉴权（JWT / session）
- 敏感板卡支持签名 URL + 时效控制
- API 限流与访问日志审计

---

## 11. 测试策略

## 11.1 单元测试
- 关系查询正确性
- 命中检测正确性
- 高亮集合计算逻辑

## 11.2 集成测试
- API + 前端联动
- 不同规模板图性能基线

## 11.3 回归与可视化测试
- 基于 Playwright 截图比对
- 关键交互路径（hover -> 高亮 -> 面板）

---

## 12. 里程碑计划

## M1（第1-2周）MVP
- 单板加载
- 缩放平移
- 元件 hover + 同 Net 高亮
- 基础侧栏信息

## M2（第3-4周）增强
- 关系分级高亮
- 流光动画
- 元件搜索与定位
- 图层显示控制

## M3（第5-6周）工程化
- tile 与 LOD 优化
- 服务端索引缓存
- 可观测性监控
- 部署与 CI/CD

---

## 13. 风险与对策

1. **原始数据质量不一致**：建立标准化校验器 + 失败告警
2. **超大板图性能瓶颈**：分块加载 + GPU 渲染 + Worker
3. **关系误判影响可信度**：人工标注通道 + 校验工具
4. **多版本板卡管理复杂**：引入 board version 与 schema version

---

## 14. 与 tscircuit 的关系定位

- tscircuit 适合“电路设计/生成/导出”场景
- 本项目核心是“现有主板可视化 + 关系分析”
- 建议将 tscircuit 作为参考或演示数据来源，而非核心渲染与关系引擎底座

---

## 15. 交付物清单（当前）

- 架构设计文档（本文件）
- 初始项目仓库骨架（README + docs）
- 远程服务器初始化与 GitHub 仓库推送
