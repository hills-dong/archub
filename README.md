# archub

基于代码**实时生成可视化架构图**，并在每次迭代提供**按 git commit 的架构图 diff** 供 review。

archub 把 [codegraph](https://github.com/colbymchenry/codegraph) 当作索引器（tree-sitter 解析 + 实时同步，维护本地 SQLite 图数据库），在其之上构建：

- **多粒度可视化**：默认模块级，可下钻到文件级、函数级
- **架构 diff**：对比两个 commit / branch / 当前工作区，图上高亮新增/删除/变化 + 导出 Markdown 变更清单
- **实时刷新**：文件保存后图自动更新

## 状态

**M1(地基)已完成。M2(探索模式)已完成。M3(快照 + git + diff + 对比模式 UI)已完成。**

- M1 交付：Node/TypeScript 工程脚手架、codegraph 在 lifly 上的验证(Rust 抽取 = GO)、codegraph SQLite 真实表结构的探明与文档化(含 M2 适配器输入映射)。
- M2 交付：codegraph 适配器 + L0 图模型 + 模块/文件/函数三级聚合引擎 + REST API (`archub serve`, `archub graph`) + 探索模式 Web UI（模块图、下钻、搜索、详情面板）。
- M3 交付：前向快照存储 + git 集成 + diff 引擎 + Markdown 报告 + REST `/api/refs`/`/api/diff` + CLI `snapshot`/`install-hook`/`diff` + 对比模式 Web UI（base/head 选择器、彩色并集图、变更报告、下钻）。

**下一步 M4**：DB 变更监听 + SSE/WebSocket 实时刷新。

参考文档：
- 完整设计：[`docs/specs/2026-05-29-archub-design.md`](docs/specs/2026-05-29-archub-design.md)
- M1 实施计划：[`docs/plans/2026-05-29-archub-m1-foundation.md`](docs/plans/2026-05-29-archub-m1-foundation.md)
- codegraph 验证(Rust go/no-go)：[`docs/verification-notes.md`](docs/verification-notes.md)
- codegraph schema + M2 适配器输入：[`docs/codegraph-schema.md`](docs/codegraph-schema.md)

## 技术栈

- 后端：Node ≥ 20 + TypeScript(ESM) + `better-sqlite3`(只读 codegraph DB) + `commander` + `express` + `simple-git`(git 集成，快照 + diff)
- 前端：React 19 + TypeScript + Vite + React Flow + dagre 布局

## 开发

```bash
pnpm install     # 需要 Node ≥ 20 + pnpm
pnpm test        # 单元 + 集成测试
pnpm build       # 编译到 dist/
```

### 前端开发服务器

前端是独立的 pnpm 子项目，位于 `web/`：

```bash
cd web && pnpm install   # 首次安装
cd web && pnpm dev       # 开发模式（/api 代理到后端 :4317）
cd web && pnpm build     # 构建到 web/dist/（archub serve 托管此目录）
```

## CLI：`archub serve`（M2 探索模式）

启动 Web 服务器，托管探索模式 UI。需先用 `cd web && pnpm build` 构建前端，
或在目标项目运行 `codegraph init -i` 建好索引：

```bash
node dist/cli.js serve --project /path/to/repo --port 4317
# 然后在浏览器打开 http://localhost:4317
```

选项：
- `--project <path>`：包含 `.codegraph/` 数据库的项目根目录（必填）
- `--port <n>`：监听端口（默认 4317）

## CLI：`archub graph`（M2 图查询）

将聚合图以 JSON 形式输出到 stdout：

```bash
node dist/cli.js graph --project /path/to/repo --level module
node dist/cli.js graph --project /path/to/repo --level file --module server/core
node dist/cli.js graph --project /path/to/repo --level function --file src/main.ts
```

选项：
- `--project <path>`：项目根目录（必填）
- `--level module|file|function`：聚合粒度（默认 module）
- `--module <id>`：将范围限定到指定模块（配合 `--level file` 使用）
- `--file <path>`：将范围限定到指定文件（配合 `--level function` 使用）

## CLI：`archub snapshot`（M3 快照）

记录当前工作区架构图的前向快照，以 git HEAD SHA 为 key：

```bash
node dist/cli.js snapshot --project /path/to/repo
# 输出：snapshot <sha> saved (N nodes, M edges)
```

> **前向快照语义**：快照只能向前记录（通过 `archub snapshot` 或 post-commit hook）。
> `archub diff` 只能对比已存储快照的 SHA 或当前工作区（`WORKING`）。

## CLI：`archub install-hook`（M3 自动快照）

在目标项目安装 git post-commit hook，每次提交后自动调用 `archub snapshot`：

```bash
node dist/cli.js install-hook --project /path/to/repo
# 如果已存在 hook 则拒绝（不覆盖）
```

## CLI：`archub diff`（M3 架构 diff）

对比两个 ref 之间的架构变化，支持 SHA、branch 名称或 `WORKING`（当前工作区）：

```bash
node dist/cli.js diff --project /path/to/repo --base HEAD --head WORKING
node dist/cli.js diff --project /path/to/repo --base main --head feature-branch --level file
node dist/cli.js diff --project /path/to/repo --base HEAD~1 --head HEAD --md
```

选项：
- `--project <path>`：项目根目录（必填）
- `--base <ref>`：基准 ref（SHA / branch / `WORKING`，必填）
- `--head <ref>`：目标 ref（SHA / branch / `WORKING`，必填）
- `--level module|file|function`：对比粒度（默认 module）
- `--md`：以可直接粘贴到 PR 的 Markdown 格式输出变更报告

## Web UI 对比模式（M3）

在探索模式 UI 顶部点击"对比"标签，进入对比模式：

- **base / head 选择器**：可选工作区、branch 名称或已存储的快照 commit
- **彩色并集图**：绿色 = 新增节点/边，红色 = 删除，黄色 = 变化
- **变更报告**：按类别分组，支持导出为 Markdown
- **下钻**：对比模式下点击节点仍可下钻到文件级/函数级

## CLI：`archub probe`（M1 调试工具）

探查任意项目的 codegraph SQLite schema（表 / 列 / 行数）。先在目标项目建好 codegraph 索引（`codegraph init -i`），然后：

```bash
node dist/cli.js probe --project /path/to/repo
node dist/cli.js probe --project /path/to/repo --json   # JSON 输出
```
