# PCB Hover Viewer

在线查看手机主板并进行“hover 关系高亮”的 Web 应用。

## 技术栈（当前确定）
- **Next.js（全栈）**
- **SQLite3（MVP/中早期）**
- PixiJS（前端高性能 2D 渲染）

## 架构决策
- 在线 API：使用 Next.js Route Handlers
- 数据库：SQLite3（后续可迁移 PostgreSQL）
- Python：仅作为可选离线预处理工具，不作为在线主后端

## 文档
- 架构设计文档：`docs/ARCHITECTURE.md`
