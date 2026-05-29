# archub

基于代码**实时生成可视化架构图**，并在每次迭代提供**按 git commit 的架构图 diff** 供 review。

archub 把 [codegraph](https://github.com/colbymchenry/codegraph) 当作索引器（tree-sitter 解析 + 实时同步，维护本地 SQLite 图数据库），在其之上构建：

- **多粒度可视化**：默认模块级，可下钻到文件级、函数级
- **架构 diff**：对比两个 commit / branch / 当前工作区，图上高亮新增/删除/变化 + 导出 Markdown 变更清单
- **实时刷新**：文件保存后图自动更新

## 状态

**M1(地基)已完成。** 已交付:Node/TypeScript 工程脚手架、codegraph 在 lifly 上的验证(Rust 抽取 = GO)、codegraph SQLite 真实表结构的探明与文档化(含 M2 适配器输入映射)。

- 完整设计:[`docs/specs/2026-05-29-archub-design.md`](docs/specs/2026-05-29-archub-design.md)
- M1 实施计划:[`docs/plans/2026-05-29-archub-m1-foundation.md`](docs/plans/2026-05-29-archub-m1-foundation.md)
- codegraph 验证(Rust go/no-go):[`docs/verification-notes.md`](docs/verification-notes.md)
- codegraph schema + M2 适配器输入:[`docs/codegraph-schema.md`](docs/codegraph-schema.md)

**下一步 M2**:schema 适配器 + L0 图模型 + L0→L1→L2 聚合 + REST API + 探索模式 Web UI。

## 技术栈

- 后端(M1 已起步):Node ≥ 20 + TypeScript(ESM)+ `better-sqlite3`(只读 codegraph DB)+ `commander`
- 后端(规划):`simple-git` 做 git 集成,快照 + diff 引擎
- 前端(规划):React 19 + TypeScript + Vite + React Flow

## 开发

```bash
pnpm install     # 需要 Node ≥ 20 + pnpm
pnpm test        # 单元 + 集成测试
pnpm build       # 编译到 dist/
```

## CLI:`archub probe`

探查任意项目的 codegraph SQLite schema(表 / 列 / 行数)。先在目标项目建好 codegraph 索引(`codegraph init -i`),然后:

```bash
node dist/cli.js probe --project /path/to/repo
node dist/cli.js probe --project /path/to/repo --json   # JSON 输出
```
