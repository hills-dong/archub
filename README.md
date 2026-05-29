# archub

基于代码**实时生成可视化架构图**，并在每次迭代提供**按 git commit 的架构图 diff** 供 review。

archub 把 [codegraph](https://github.com/colbymchenry/codegraph) 当作索引器（tree-sitter 解析 + 实时同步，维护本地 SQLite 图数据库），在其之上构建：

- **多粒度可视化**：默认模块级，可下钻到文件级、函数级
- **架构 diff**：对比两个 commit / branch / 当前工作区，图上高亮新增/删除/变化 + 导出 Markdown 变更清单
- **实时刷新**：文件保存后图自动更新

## 状态

设计阶段。完整设计见 [`docs/specs/2026-05-29-archub-design.md`](docs/specs/2026-05-29-archub-design.md)。

## 技术栈（规划）

- 前端：React 19 + TypeScript + Vite + React Flow
- 后端：Node + TypeScript（`better-sqlite3` 读 codegraph DB，`simple-git` 做 git 集成）
