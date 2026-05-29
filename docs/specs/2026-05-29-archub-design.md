# archub 设计文档

- **日期**: 2026-05-29
- **项目**: archub — 基于代码实时生成可视化架构图，并提供按 commit 的架构图 diff review
- **位置**: `/home/hills/projects/archub`（独立仓库，与 lifly 平级）
- **状态**: 设计已确认，待写实现计划

---

## 1. 目标与背景

### 1.1 解决的问题
开发者需要在每次迭代时直观地 review **架构层面的变化**——哪些模块/文件/函数新增或删除、模块间依赖关系如何演变——而不是逐行读 code diff。

### 1.2 两个核心能力
1. **从代码实时生成可视化架构图**：默认模块级，可下钻到文件级、函数级。
2. **按 git commit 的架构图 diff**：每次迭代对比两个时间点的架构，图上高亮变化 + 输出文字变更清单，供 review 并附到 PR。

### 1.3 范围策略
- **v1 先服务 lifly 项目**（Rust 后端 `server/` + React/TS 前端 `web/`）。
- 设计上**保留通用化空间**：模块分组可配置、整体可抽成独立 npm 包对任意仓库使用。

---

## 2. 与 codegraph 的关系（路线 1）

[codegraph](https://github.com/colbymchenry/codegraph) 用 tree-sitter 解析 20+ 语言，抽取函数级节点（函数/类/struct）和边（调用/导入），存入本地 SQLite（`.codegraph/codegraph.db`），并用原生文件监听做 2s 防抖的实时增量同步。

**archub 采用"路线 1：把 codegraph 当索引器"**：
- **codegraph 负责**：解析 + 实时同步，维护 `.codegraph/codegraph.db`（archub 不重复造解析轮子）。
- **archub 负责**：读这个 DB → 聚合 → 快照 → diff → 可视化。
- **解耦方式**：通过 SQLite 文件 + 一层 **schema 适配器**（schema 变化只改一处，并有测试在变化时报错）。
- **版本策略**：锁定 codegraph 版本，适配器隔离漂移风险。

> 备选路线（已否决）：路线 2（只用 codegraph 公开 CLI/库 API）拿不到"全图"单一导出，全量边不一定齐；路线 3（fork 抽取层）等于接手维护 20+ 语言解析器，过度工程。

---

## 3. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│  codegraph (索引器, 外部依赖)                                  │
│  tree-sitter 解析 + 文件监听 → .codegraph/codegraph.db        │
└───────────────────────────┬─────────────────────────────────┘
                            │ 读 SQLite (better-sqlite3)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  archub backend (Node + TypeScript)                           │
│  ┌─────────────┐ ┌────────────┐ ┌──────────┐ ┌────────────┐ │
│  │ schema 适配器│→│ 聚合引擎    │ │ 快照存储  │ │ diff 引擎   │ │
│  │ (DB→L0 图)  │ │ L0→L1→L2   │ │ (按 SHA)  │ │ (增/删/变)  │ │
│  └─────────────┘ └────────────┘ └──────────┘ └────────────┘ │
│  ┌─────────────┐ ┌──────────────────────────────────────┐   │
│  │ git 集成     │ │ REST API + SSE/WS(实时刷新) + 静态托管 │   │
│  │ (simple-git) │ └──────────────────────────────────────┘   │
│  └─────────────┘                                              │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP / SSE
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  archub frontend (React 19 + TS + Vite)                       │
│  React Flow + dagre/ELK 分层布局                               │
│  ├─ 探索模式: 实时图, 下钻, 搜索                                │
│  └─ 对比模式: base/head 选择, 高亮 diff + 文字报告             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 图模型与多粒度聚合

### 4.1 三层节点模型
| 层级 | 节点 | 来源 |
|---|---|---|
| **L0 函数级** | 函数 / 方法 / 类 / struct | codegraph 原生节点 |
| **L1 文件级** | `.rs` / `.tsx` 等文件 | 按 file path 聚合 L0 |
| **L2 模块级**（默认视图）| `identity / capability / tool / data / intelligence / common`、前端 `pages / components` 等 | 按目录聚合 L1 |

底层始终保存完整 **L0 图**，各层级视图按需 roll-up 计算。

### 4.2 边的聚合
- L0 边类型：调用边（fn→fn）、导入边（file→file）。
- 聚合规则：模块/文件 A→B 的边存在 ⟺ 存在任意一条 L0 边从 A 内符号指向 B 内符号。
- **边粗细 = 底层 L0 边的条数**（直观反映耦合强弱）。
- 方向保留（依赖是有向的）。

### 4.3 模块定义
- **默认启发式**：按"语言根目录下第一层子目录"自动分组。lifly 天然得到 `server/src/{identity,capability,tool,data,intelligence,common}` 与 `web/src/{pages,components,...}`。
- **可配置**：`archub.config`（glob → 模块名）允许手动调整分组——为通用化预留。

### 4.4 下钻交互
- 点模块节点 → 展开为内部文件 + 文件间边；点文件 → 展开为函数。
- 面包屑逐级返回。

### 4.5 跨语言现实
lifly 后端(Rust) 与前端(TS) 通过 HTTP 通信、**无代码级调用**，图上自然呈现"后端簇 + 前端簇"两块、中间无连线——符合预期。
- **未来增强（YAGNI 暂不做）**：可选添加"前端 axios 调用 → 后端 route"的契约边。

---

## 5. 快照与 diff

### 5.1 快照内容
- 始终序列化**完整 L0 图**（非聚合后），使同一份快照能在任意层级（模块/文件/函数）算 diff。
- 存储：`.archub/snapshots/<sha>.json.gz`（gzip JSON）+ 一个索引文件（SHA → 时间 / commit message）。

### 5.2 稳定节点 ID
- 不用 codegraph 内部 id（可能不稳）。archub 自派生稳定 key：
  `语言:文件路径:类型:限定名`，例如 `rust:server/src/identity/mod.rs:fn:login`。
- **v1 把"改名/移动"视为 删除+新增**；rename 检测留作后续增强。

### 5.3 快照触发
- git `post-commit` hook 自动跑 `archub snapshot`：读当前 DB → 建 L0 图 → 按 `git rev-parse HEAD` 存档。
- hook **可选安装**（`archub install-hook`），不偷偷改 git 配置。
- 同时保留手动命令 `archub snapshot`。

### 5.4 diff 算法（在选定层级上计算）
- **新增 / 删除节点**（模块/文件/函数）。
- **新增 / 删除依赖边**。
- **变化节点** = id 两边都存在、但出边集合不同的节点（即"它依赖的东西变了"）→ 标黄。

### 5.5 呈现（图 + 文字，二者都要）
- **图**：渲染两版并集，新增=绿、删除=红(虚线幽灵)、变化=黄、未变=淡灰。
- **文字报告**：按 新增/删除/变化 分组的结构化清单（如 `+ 边 tool→data`、`~ capability 现在依赖 intelligence`），可**导出 Markdown** 贴到 PR。

### 5.6 支持的对比对象
- `commit ↔ commit`
- `branch ↔ branch`（解析到各自 HEAD sha）
- **当前工作区(实时) ↔ 任意快照**（提交前即可 review）
- 下钻在对比模式下同样可用（在钻入层级重算 diff）。

### 5.7 缺快照的处理
因采用"向前快照"策略，若对比的 base 无存档，明确提示"快照从 <最早 SHA> 开始"，不静默出错。
> 未来增强：路线 B（按需 checkout 历史 commit 重建索引）以支持回溯任意历史，暂不做。

---

## 6. Web UI / 交互

独立本地 Web 应用，两种模式：

### 6.1 探索模式
- 读当前工作区的实时图，默认模块级。
- 点节点下钻、面包屑返回、平移/缩放、搜索跳转、右侧面板看节点详情。
- **实时刷新**：codegraph 重新同步 DB 后，archub backend 检测到 DB 文件变化 → 经 SSE/WS 推送前端刷新。

### 6.2 对比模式
- 顶部选 base / head（下拉：commit / branch / 当前工作区）。
- 中间画并集图带颜色高亮，右侧是分组文字变更报告（可导出 Markdown）。

### 6.3 布局
- 依赖有向 → 用**分层有向布局**（dagre / ELK layered），上游在上、下游在下，依赖方向一目了然。

---

## 7. 技术栈与代码组织

| 部分 | 选型 | 理由 |
|---|---|---|
| 前端 | React 19 + TS + Vite + pnpm | 与 lifly web 同栈，团队熟悉 |
| 图渲染 | **React Flow** + dagre/ELK 布局 | 自定义节点组件做下钻 + diff 配色最顺手；聚合后图较小，性能无忧（备选 Cytoscape.js） |
| 后端 | **Node + TypeScript** | codegraph 是 Node，从 Node 读其 SQLite 最省事；整体可打包成独立 npm 包（通用化） |
| 读 DB | `better-sqlite3` | 同步、快、读 codegraph SQLite |
| git 集成 | `simple-git` | 列 commit/branch、resolve sha、装 hook |
| 通信 | REST + SSE/WS | 实时刷新探索模式 |

**代码位置**：`/home/hills/projects/archub`（独立仓库）。目录结构按"可独立发布的 npm 包"组织。

---

## 8. 测试策略

遵循 lifly CLAUDE.md 的真实数据 / 完整闭环要求：

- **单元测试**：聚合 roll-up（L0→L1→L2）、diff 引擎（增/删/变）。fixture 用从 lifly 真实抽出的图，不造假数据。
- **集成测试**：对 **lifly 真实代码**跑 codegraph，断言真实模块（identity/capability/tool…）和已知边都出现。
- **diff 测试**：commit N 打快照 → 真实加一条依赖 → commit N+1 打快照 → 断言 diff 精确报出那一条边。
- **E2E（Playwright）**：打开应用 → 看到模块图 → 钻进某模块 → 切对比模式选两个 commit → 断言绿/红高亮 + 文字报告里的**具体内容值**（不止"图渲染了"）。

---

## 9. 风险与前置验证关卡（实现第一步即做）

| # | 风险 | 验证动作 | 性质 |
|---|---|---|---|
| 1 | codegraph 表结构未知 | 扒真实 DB schema，写适配器 + schema 变化即报错的测试 | 必做 |
| 2 | **Rust 抽取质量** | 对 lifly `server/` 跑 codegraph，人工确认真抽到模块/边（非空/非乱） | **go/no-go 关卡** |
| 3 | 全图导出路径 | 确认库 API 能否枚举全部 nodes+edges，否则直读 SQLite 表 | 必做 |
| 4 | codegraph 版本漂移 | 锁版本，适配器隔离 | 持续 |

> 风险 2 若 Rust 支持差，必须**立即上报**，可能需要重新评估方案（如改用其他 Rust 解析方案补充）。

---

## 10. 明确不做（Out of Scope / Future）

- rename / move 检测（v1 视为 删除+新增）
- 前端→后端的 API 契约边
- 路线 B：按需 checkout 历史 commit 重建索引（回溯任意历史架构）
- 通用化的完整打包发布（v1 聚焦 lifly dogfood，但结构预留）
