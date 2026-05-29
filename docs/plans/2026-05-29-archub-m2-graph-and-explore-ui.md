# archub M2: 图引擎 + 聚合 + REST API + 探索模式 Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M1 探明的 codegraph 真实 schema 之上，构建 archub 的后端图引擎（适配器→多粒度聚合→REST API）和探索模式 Web UI（React Flow 模块图 + 下钻 + 搜索），端到端 dogfood lifly。

**Architecture:** 后端用 better-sqlite3 只读 codegraph DB，适配器把 nodes/edges 映射成 archub L0 图（稳定 ID），聚合引擎按需 roll-up 到文件级(L1)/模块级(L2)，express 经 REST API 暴露多粒度图 + 节点详情 + 搜索；前端独立 Vite/React 应用用 React Flow + dagre 分层布局渲染，支持模块→文件→函数下钻、面包屑、搜索、详情面板。后端构建后把前端静态产物一并托管。

**Tech Stack:** 后端 Node ≥20 + TS(ESM/NodeNext) · better-sqlite3 · express · supertest(测试) · vitest。前端 React 19 + Vite + TypeScript · @xyflow/react(React Flow v12) · @dagrejs/dagre(分层布局) · vitest + @testing-library/react + jsdom(组件单测) · Playwright(E2E)。

---

> **里程碑路线图（本计划覆盖 M2）**
> - M1（已完成）：地基 + codegraph 验证 + schema 探明。
> - **M2（本计划）**：图引擎(适配器+聚合) + REST API + 探索模式 Web UI。
> - M3：向前快照 + git 集成 + diff 引擎 + 对比模式 UI（图高亮 + Markdown 报告）。
> - M4：DB 变化检测 + SSE/WS 实时刷新 + 打磨。
> 设计全文见 `docs/specs/2026-05-29-archub-design.md`。codegraph 真实 schema + 本计划所依据的实证发现见 `docs/codegraph-schema.md`。

## 本计划明确不做（M3/M4 范围，勿越界）
- 快照、git 集成、diff、对比模式 UI（M3）。
- DB 文件变化检测、SSE/WS 实时刷新（M4）。探索模式 M2 下读一次当前 DB；刷新靠手动重载页面/重新请求。
- rename 检测、前端→后端契约边（spec 第 10 节）。

---

## 关键技术决策（本计划据此，执行者勿自行更改）

1. **HTTP 框架：express**（生态最通用、SSE/WS 后续可加）。读 DB 仍用 better-sqlite3。
2. **前端图库：`@xyflow/react`**（React Flow v12 的新包名，旧名 `reactflow` 是 v11，勿用）。布局用 **`@dagrejs/dagre`** 做有向分层布局。
3. **前端目录：`web/`**（archub 仓库内，独立 Vite 应用），构建产物 `web/dist/` 由后端作为静态资源托管在 `/`。
4. **前端取数：原生 `fetch`**（不引 axios，减依赖）。
5. **依赖边定义（已实证，见 `docs/codegraph-schema.md`）**：架构依赖边只取 codegraph 的 `calls` / `references` / `instantiates` 三种 kind。**排除** `contains`（结构嵌套，非依赖）与 `imports`（指向本地 import 语句节点 `file→import`，不解析到真实目标，无依赖语义）。
6. **L0 符号节点**：取 nodes 表中 `kind NOT IN ('file','import')` 的节点（lifly: 427 个）。`file`/`import` 节点不进图。
7. **archub 稳定节点 ID（5 段，已实证唯一）**：`language:file_path:kind:qualified_name:start_line`（4 段会在 Rust import 上冲突；本计划已排除 import，但仍统一用 5 段以保证唯一与一致）。
8. **codegraph 版本锁定 0.9.7**（M1 验证版本）。

---

## 模块划分规则（L2）

L2 模块 = "语言源根目录下的第一层子目录"。实现为 `resolveModule(filePath, config?)`：
- 若提供 `archub.config.json`（可选，置于**目标项目根**，如 `/home/hills/projects/lifly/archub.config.json`），形如 `{ "modules": [{ "glob": "server/src/identity/**", "name": "identity" }, ...] }`，按数组顺序取第一个 glob 命中的 `name`。
- 否则用默认启发式 `defaultModule(filePath)`：在路径段中找到第一个等于 `src` 或 `lib` 的段（下标 ≥1），取其上一段为 `top`、下一段为 `seg`，模块名 = `top/seg`；找不到 `src|lib` 时退化为前两段拼接（不足两段则取首段）。
  - lifly 实例：`server/src/identity/service.rs` → `server/identity`；`web/src/pages/Login.tsx` → `web/pages`；`server/src/main.rs` → `server/main.rs`（根级文件自成模块）；`server/tests/integration.rs` → `server/tests`。

---

## API 契约 / 共享类型（后端与前端共用，唯一事实来源）

后端在 `src/graph/types.ts` 定义；前端在 `web/src/api/types.ts` 复制同名类型（两边手工保持一致，类型名/字段名必须逐字相同）。

```ts
export type Level = 'module' | 'file' | 'function'

// API DTO —— /api/graph 返回的节点（某一粒度下的一个节点）
export interface GraphNodeDTO {
  id: string            // 该粒度下的节点标识: module=模块名, file=文件相对路径, function=archub 稳定 ID
  label: string         // 展示名
  level: Level
  kind: string          // module/file 粒度为 'module'/'file'; function 粒度为底层 L0 kind(function/method/struct...)
  language: string | null
  childCount: number    // 该节点下含的 L0 符号数（function 粒度恒为 1）
  filePath: string | null // function 粒度填所在文件; 其它为 null
}

export interface GraphEdgeDTO {
  source: string        // GraphNodeDTO.id
  target: string        // GraphNodeDTO.id
  weight: number        // 底层 L0 依赖边条数（边粗细用）
}

export interface GraphResponse {
  level: Level
  scope: string | null  // file 粒度=所属 module id; function 粒度=所属 file id; module 总览=null
  nodes: GraphNodeDTO[]
  edges: GraphEdgeDTO[]
}

// /api/node?id=... 返回（单个 L0 符号详情）
export interface NodeDetail {
  id: string
  name: string
  qualifiedName: string
  kind: string
  filePath: string
  language: string
  startLine: number
  endLine: number
  signature: string | null
  visibility: string | null
  isExported: boolean
}

// /api/search?q=... 返回项
export interface SearchHit {
  id: string
  name: string
  qualifiedName: string
  kind: string
  filePath: string
  module: string
}
```

**端点：**
- `GET /api/graph?level=module` → 模块总览（nodes=模块, edges=模块间依赖）。`scope`=null。
- `GET /api/graph?level=file&module=<moduleId>` → 该模块内的文件 + 文件间依赖边。`scope`=moduleId。
- `GET /api/graph?level=function&file=<filePath>` → 该文件内的符号 + 符号间依赖边。`scope`=filePath。
- `GET /api/node?id=<archub稳定ID>` → `NodeDetail`；找不到返回 404 `{ error }`。
- `GET /api/search?q=<query>` → `SearchHit[]`（按 name/qualified_name 子串匹配，上限 50 条）。
- 缺参数（如 file 粒度缺 `module`）返回 400 `{ error }`。

---

## File Structure（M2 涉及的文件）

```
archub/
  src/
    graph/
      types.ts        # 共享类型 + L0 内部类型
      id.ts           # archub 稳定 ID 派生
      adapter.ts      # codegraph DB → L0 图（只读, 过滤 kind, 映射 ID, 翻译边）
      modules.ts      # 模块划分规则（默认启发式 + config）
      aggregate.ts    # L0 → 指定粒度(module/file/function) 的聚合 + 边 roll-up
      service.ts      # getGraph / getNode / search（组合上面, 产出 API DTO）
    server/
      app.ts          # express app 工厂（注册路由 + 静态托管 web/dist）
      routes.ts       # /api/* 路由处理
    cli.ts            # +serve(启动服务) +graph(dump JSON) 子命令
  tests/
    graph/
      id.test.ts
      adapter.test.ts
      modules.test.ts
      aggregate.test.ts
      service.test.ts
    server/
      app.test.ts
    integration/
      lifly-graph.test.ts   # 对 lifly 真实 DB 跑全链路
  web/                      # 独立 Vite/React 前端
    package.json
    vite.config.ts
    index.html
    tsconfig.json
    playwright.config.ts
    src/
      main.tsx
      App.tsx
      api/
        types.ts            # 与 src/graph/types.ts 的 DTO 同步
        client.ts           # fetch 封装
      graph/
        layout.ts           # dagre 分层布局
        ModuleNode.tsx      # 自定义节点组件
        GraphCanvas.tsx     # React Flow 画布
      explore/
        ExploreView.tsx     # 探索模式: 画布 + 面包屑 + 搜索 + 详情面板
        Breadcrumb.tsx
        SearchBox.tsx
        DetailPanel.tsx
    tests/
      client.test.ts
      layout.test.ts
      ExploreView.test.tsx
    e2e/
      explore.spec.ts       # Playwright E2E（对真实后端 + lifly 数据）
```

每文件单一职责：`adapter` 只做 DB→L0，`modules` 只做归组，`aggregate` 只做 roll-up（纯函数），`service` 只做组合，`routes`/`app` 只做 HTTP，前端各组件职责单一。

---

# PART A —— 后端图引擎 + REST API

## Task 1: 图类型 + archub 稳定 ID

**Files:**
- Create: `src/graph/types.ts`
- Create: `src/graph/id.ts`
- Test: `tests/graph/id.test.ts`

- [ ] **Step 1: 写 `src/graph/types.ts`**（共享 DTO + L0 内部类型；无逻辑，不需测试）

```ts
export type Level = 'module' | 'file' | 'function'

// ---- L0 内部类型（不出 API） ----
export interface L0Node {
  id: string            // archub 稳定 ID
  cgId: string          // codegraph nodes.id（用于翻译边）
  kind: string
  name: string
  qualifiedName: string
  filePath: string
  language: string
  startLine: number
  endLine: number
  signature: string | null
  visibility: string | null
  isExported: boolean
}
export interface L0Edge {
  source: string        // archub 稳定 ID
  target: string        // archub 稳定 ID
  kind: string          // calls | references | instantiates
}
export interface L0Graph {
  nodes: L0Node[]
  edges: L0Edge[]
}

// ---- API DTO ----
export interface GraphNodeDTO {
  id: string
  label: string
  level: Level
  kind: string
  language: string | null
  childCount: number
  filePath: string | null
}
export interface GraphEdgeDTO {
  source: string
  target: string
  weight: number
}
export interface GraphResponse {
  level: Level
  scope: string | null
  nodes: GraphNodeDTO[]
  edges: GraphEdgeDTO[]
}
export interface NodeDetail {
  id: string
  name: string
  qualifiedName: string
  kind: string
  filePath: string
  language: string
  startLine: number
  endLine: number
  signature: string | null
  visibility: string | null
  isExported: boolean
}
export interface SearchHit {
  id: string
  name: string
  qualifiedName: string
  kind: string
  filePath: string
  module: string
}
```

- [ ] **Step 2: 写失败测试 `tests/graph/id.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { archubId } from '../../src/graph/id.js'

describe('archubId', () => {
  it('builds a 5-part stable id', () => {
    expect(
      archubId({ language: 'rust', filePath: 'server/src/identity/service.rs', kind: 'function', qualifiedName: 'login', startLine: 13 }),
    ).toBe('rust:server/src/identity/service.rs:function:login:13')
  })

  it('disambiguates same-name imports by start line', () => {
    const a = archubId({ language: 'rust', filePath: 'a.rs', kind: 'import', qualifiedName: 'axum', startLine: 1 })
    const b = archubId({ language: 'rust', filePath: 'a.rs', kind: 'import', qualifiedName: 'axum', startLine: 2 })
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 3: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test id`. Expected: FAIL（无法解析 `id.js`）。

- [ ] **Step 4: 实现 `src/graph/id.ts`**

```ts
export interface IdParts {
  language: string
  filePath: string
  kind: string
  qualifiedName: string
  startLine: number
}

export function archubId(p: IdParts): string {
  return `${p.language}:${p.filePath}:${p.kind}:${p.qualifiedName}:${p.startLine}`
}
```

- [ ] **Step 5: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test id`. Expected: PASS（2 passed）。

- [ ] **Step 6: 提交**

```bash
cd /home/hills/projects/archub
git add src/graph/types.ts src/graph/id.ts tests/graph/id.test.ts
git commit -m "feat(graph): shared graph types + archub stable node id"
```

---

## Task 2: codegraph 适配器（DB → L0 图）

**Files:**
- Create: `src/graph/adapter.ts`
- Test: `tests/graph/adapter.test.ts`

适配器读 `nodes`（排除 `file`/`import` kind）和 `edges`（只取 `calls`/`references`/`instantiates`），给每个节点派生 archub 稳定 ID，并把 edges 的 `source`/`target`（codegraph id）翻译成 archub ID；端点不在保留集合内的边丢弃。

- [ ] **Step 1: 写失败测试 `tests/graph/adapter.test.ts`**（用内存 sqlite 造一个迷你 codegraph DB）

```ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { loadL0Graph } from '../../src/graph/adapter.js'

function fixture(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT,
    language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('function:h1', 'function', 'login', 'login', 'a.rs', 'rust', 10, 20, '() -> R', 'public', 0)
  n.run('function:h2', 'function', 'create_token', 'create_token', 'b.rs', 'rust', 5, 9, null, 'public', 0)
  n.run('file:a.rs', 'file', 'a.rs', 'a.rs', 'a.rs', 'rust', 1, 1, null, null, 0)         // 应被排除
  n.run('import:h3', 'import', 'axum', 'axum', 'a.rs', 'rust', 1, 1, null, null, 0)        // 应被排除
  const e = db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`)
  e.run('function:h1', 'function:h2', 'calls')        // 保留 (login -> create_token)
  e.run('file:a.rs', 'function:h1', 'contains')       // 丢弃 (contains)
  e.run('file:a.rs', 'import:h3', 'imports')          // 丢弃 (imports)
  e.run('function:h1', 'import:h3', 'references')     // 丢弃 (target 是被排除的 import 节点)
  return db
}

describe('loadL0Graph', () => {
  it('keeps only symbol nodes (drops file/import)', () => {
    const g = loadL0Graph(fixture())
    expect(g.nodes.map((x) => x.name).sort()).toEqual(['create_token', 'login'])
  })

  it('maps node id to 5-part archub id', () => {
    const g = loadL0Graph(fixture())
    const login = g.nodes.find((x) => x.name === 'login')!
    expect(login.id).toBe('rust:a.rs:function:login:10')
    expect(login.cgId).toBe('function:h1')
  })

  it('keeps only calls/references/instantiates edges with both endpoints retained, translated to archub ids', () => {
    const g = loadL0Graph(fixture())
    expect(g.edges).toEqual([
      { source: 'rust:a.rs:function:login:10', target: 'rust:b.rs:function:create_token:5', kind: 'calls' },
    ])
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test adapter`. Expected: FAIL（无法解析 `adapter.js`）。

- [ ] **Step 3: 实现 `src/graph/adapter.ts`**

```ts
import type Database from 'better-sqlite3'
import { archubId } from './id.js'
import type { L0Graph, L0Node, L0Edge } from './types.js'

const DEP_EDGE_KINDS = new Set(['calls', 'references', 'instantiates'])
const EXCLUDED_NODE_KINDS = new Set(['file', 'import'])

interface RawNode {
  id: string
  kind: string
  name: string
  qualified_name: string
  file_path: string
  language: string
  start_line: number
  end_line: number
  signature: string | null
  visibility: string | null
  is_exported: number
}
interface RawEdge {
  source: string
  target: string
  kind: string
}

export function loadL0Graph(db: Database.Database): L0Graph {
  const rawNodes = db
    .prepare(
      `SELECT id, kind, name, qualified_name, file_path, language,
              start_line, end_line, signature, visibility, is_exported
       FROM nodes WHERE kind NOT IN ('file', 'import')`,
    )
    .all() as RawNode[]

  const byCgId = new Map<string, L0Node>()
  const nodes: L0Node[] = rawNodes.map((r) => {
    const node: L0Node = {
      id: archubId({
        language: r.language,
        filePath: r.file_path,
        kind: r.kind,
        qualifiedName: r.qualified_name,
        startLine: r.start_line,
      }),
      cgId: r.id,
      kind: r.kind,
      name: r.name,
      qualifiedName: r.qualified_name,
      filePath: r.file_path,
      language: r.language,
      startLine: r.start_line,
      endLine: r.end_line,
      signature: r.signature,
      visibility: r.visibility,
      isExported: r.is_exported === 1,
    }
    byCgId.set(r.id, node)
    return node
  })

  const rawEdges = db
    .prepare(`SELECT source, target, kind FROM edges WHERE kind IN ('calls', 'references', 'instantiates')`)
    .all() as RawEdge[]

  const edges: L0Edge[] = []
  for (const e of rawEdges) {
    const s = byCgId.get(e.source)
    const t = byCgId.get(e.target)
    if (!s || !t) continue // 端点指向被排除的节点(如 import) → 丢弃
    edges.push({ source: s.id, target: t.id, kind: e.kind })
  }

  return { nodes, edges }
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test adapter`. Expected: PASS（3 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/graph/adapter.ts tests/graph/adapter.test.ts
git commit -m "feat(graph): codegraph DB -> L0 graph adapter (filter kinds, map ids, translate edges)"
```

---

## Task 3: 模块划分规则

**Files:**
- Create: `src/graph/modules.ts`
- Test: `tests/graph/modules.test.ts`

- [ ] **Step 1: 写失败测试 `tests/graph/modules.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { defaultModule, resolveModule } from '../../src/graph/modules.js'

describe('defaultModule', () => {
  it('uses top + first segment under src', () => {
    expect(defaultModule('server/src/identity/service.rs')).toBe('server/identity')
    expect(defaultModule('web/src/pages/Login.tsx')).toBe('web/pages')
  })
  it('treats a root-level file under src as its own module', () => {
    expect(defaultModule('server/src/main.rs')).toBe('server/main.rs')
  })
  it('handles lib as a source root', () => {
    expect(defaultModule('pkg/lib/core/x.ts')).toBe('pkg/core')
  })
  it('falls back to first two segments when no src/lib', () => {
    expect(defaultModule('server/tests/integration.rs')).toBe('server/tests')
  })
  it('falls back to the only segment for a bare filename', () => {
    expect(defaultModule('README.md')).toBe('README.md')
  })
})

describe('resolveModule with config', () => {
  it('matches the first glob rule', () => {
    const config = { modules: [{ glob: 'server/src/identity/**', name: 'auth' }] }
    expect(resolveModule('server/src/identity/service.rs', config)).toBe('auth')
  })
  it('falls back to defaultModule when no rule matches', () => {
    const config = { modules: [{ glob: 'web/**', name: 'frontend' }] }
    expect(resolveModule('server/src/data/x.rs', config)).toBe('server/data')
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test modules`. Expected: FAIL（无法解析 `modules.js`）。

- [ ] **Step 3: 实现 `src/graph/modules.ts`**（用极简 glob：`**`→`.*`, `*`→`[^/]*`，其余按字面，避免引依赖）

```ts
export interface ModuleRule {
  glob: string
  name: string
}
export interface ArchubConfig {
  modules?: ModuleRule[]
}

export function defaultModule(filePath: string): string {
  const parts = filePath.split('/')
  const srcIdx = parts.findIndex((p, i) => i >= 1 && (p === 'src' || p === 'lib'))
  if (srcIdx >= 1 && srcIdx + 1 < parts.length) {
    return `${parts.slice(0, srcIdx).join('/')}/${parts[srcIdx + 1]}`
  }
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
  return parts[0]
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const pattern = escaped.replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*')
  return new RegExp(`^${pattern}$`)
}

export function resolveModule(filePath: string, config?: ArchubConfig): string {
  for (const rule of config?.modules ?? []) {
    if (globToRegExp(rule.glob).test(filePath)) return rule.name
  }
  return defaultModule(filePath)
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test modules`. Expected: PASS（7 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/graph/modules.ts tests/graph/modules.test.ts
git commit -m "feat(graph): module resolution (src/lib heuristic + optional glob config)"
```

---

## Task 4: 聚合引擎（L0 → 指定粒度 + 边 roll-up）

**Files:**
- Create: `src/graph/aggregate.ts`
- Test: `tests/graph/aggregate.test.ts`

纯函数 `aggregate(l0, level, scope, resolveFn)`：把每个 L0 节点映射到目标粒度的"容器 id"，产出该粒度的节点（含 childCount）和边（跨容器的 L0 依赖边按 (容器对) 累加 weight，丢弃同容器自环）。

- [ ] **Step 1: 写失败测试 `tests/graph/aggregate.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { aggregate } from '../../src/graph/aggregate.js'
import type { L0Graph } from '../../src/graph/types.js'
import { defaultModule } from '../../src/graph/modules.js'

const g: L0Graph = {
  nodes: [
    { id: 'rust:server/src/identity/service.rs:function:login:10', cgId: 'c1', kind: 'function', name: 'login', qualifiedName: 'login', filePath: 'server/src/identity/service.rs', language: 'rust', startLine: 10, endLine: 20, signature: null, visibility: 'public', isExported: false },
    { id: 'rust:server/src/common/auth.rs:function:create_token:5', cgId: 'c2', kind: 'function', name: 'create_token', qualifiedName: 'create_token', filePath: 'server/src/common/auth.rs', language: 'rust', startLine: 5, endLine: 9, signature: null, visibility: 'public', isExported: false },
    { id: 'rust:server/src/identity/service.rs:function:helper:30', cgId: 'c3', kind: 'function', name: 'helper', qualifiedName: 'helper', filePath: 'server/src/identity/service.rs', language: 'rust', startLine: 30, endLine: 35, signature: null, visibility: 'private', isExported: false },
  ],
  edges: [
    { source: 'rust:server/src/identity/service.rs:function:login:10', target: 'rust:server/src/common/auth.rs:function:create_token:5', kind: 'calls' },
    { source: 'rust:server/src/identity/service.rs:function:login:10', target: 'rust:server/src/identity/service.rs:function:helper:30', kind: 'calls' },
  ],
}
const mod = (fp: string) => defaultModule(fp)

describe('aggregate', () => {
  it('module level: nodes are modules with childCount, edges are cross-module deps with weight', () => {
    const r = aggregate(g, 'module', null, mod)
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['server/common', 'server/identity'])
    const identity = r.nodes.find((n) => n.id === 'server/identity')!
    expect(identity.childCount).toBe(2) // login + helper
    expect(identity.level).toBe('module')
    // login->create_token 跨模块; login->helper 同模块(丢弃)
    expect(r.edges).toEqual([{ source: 'server/identity', target: 'server/common', weight: 1 }])
  })

  it('file level scoped to a module: only that module files, intra-module file edges', () => {
    const r = aggregate(g, 'file', 'server/identity', mod)
    expect(r.nodes.map((n) => n.id)).toEqual(['server/src/identity/service.rs'])
    expect(r.nodes[0].childCount).toBe(2)
    expect(r.edges).toEqual([]) // login->helper 同文件(自环丢弃); login->create_token 出了本模块(不计)
  })

  it('function level scoped to a file: symbols in file + intra-file edges', () => {
    const r = aggregate(g, 'function', 'server/src/identity/service.rs', mod)
    expect(r.nodes.map((n) => n.id).sort()).toEqual([
      'rust:server/src/identity/service.rs:function:helper:30',
      'rust:server/src/identity/service.rs:function:login:10',
    ])
    expect(r.nodes.every((n) => n.childCount === 1 && n.level === 'function')).toBe(true)
    expect(r.edges).toEqual([
      { source: 'rust:server/src/identity/service.rs:function:login:10', target: 'rust:server/src/identity/service.rs:function:helper:30', weight: 1 },
    ])
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test aggregate`. Expected: FAIL（无法解析 `aggregate.js`）。

- [ ] **Step 3: 实现 `src/graph/aggregate.ts`**

```ts
import type { L0Graph, L0Node, Level, GraphNodeDTO, GraphEdgeDTO } from './types.js'

type ResolveModule = (filePath: string) => string

/** 某个 L0 节点在目标粒度下的容器 id。null = 该节点不属于当前 scope。 */
function containerId(node: L0Node, level: Level, scope: string | null, mod: ResolveModule): string | null {
  if (level === 'module') return mod(node.filePath)
  if (level === 'file') {
    if (mod(node.filePath) !== scope) return null
    return node.filePath
  }
  // function
  if (node.filePath !== scope) return null
  return node.id
}

function nodeDTO(id: string, node: L0Node, level: Level): GraphNodeDTO {
  if (level === 'module') return { id, label: id, level, kind: 'module', language: node.language, childCount: 0, filePath: null }
  if (level === 'file') {
    const label = id.split('/').pop() ?? id
    return { id, label, level, kind: 'file', language: node.language, childCount: 0, filePath: id }
  }
  return { id, label: node.name, level, kind: node.kind, language: node.language, childCount: 1, filePath: node.filePath }
}

export function aggregate(l0: L0Graph, level: Level, scope: string | null, mod: ResolveModule): { nodes: GraphNodeDTO[]; edges: GraphEdgeDTO[] } {
  // 1) 建节点 + childCount + L0 节点 id → 容器 id 映射
  const containerOf = new Map<string, string>() // L0 node id -> container id
  const nodes = new Map<string, GraphNodeDTO>()
  for (const n of l0.nodes) {
    const cid = containerId(n, level, scope, mod)
    if (cid === null) continue
    containerOf.set(n.id, cid)
    const existing = nodes.get(cid)
    if (existing) {
      existing.childCount += level === 'function' ? 0 : 1
    } else {
      nodes.set(cid, nodeDTO(cid, n, level))
      if (level !== 'function') nodes.get(cid)!.childCount = 1
    }
  }

  // 2) 边 roll-up：跨容器的依赖边按 (src,tgt) 累加，丢自环
  const weights = new Map<string, GraphEdgeDTO>()
  for (const e of l0.edges) {
    const s = containerOf.get(e.source)
    const t = containerOf.get(e.target)
    if (s === undefined || t === undefined) continue // 端点不在当前 scope
    if (s === t) continue // 同容器自环丢弃
    const key = `${s} ${t}`
    const w = weights.get(key)
    if (w) w.weight += 1
    else weights.set(key, { source: s, target: t, weight: 1 })
  }

  return { nodes: [...nodes.values()], edges: [...weights.values()] }
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test aggregate`. Expected: PASS（3 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/graph/aggregate.ts tests/graph/aggregate.test.ts
git commit -m "feat(graph): multi-granularity aggregation with edge roll-up + weights"
```

---

## Task 5: 图查询服务（getGraph / getNode / search）

**Files:**
- Create: `src/graph/service.ts`
- Test: `tests/graph/service.test.ts`

服务持有一份从 DB 加载的 L0 图（构造时读一次）+ 可选 config，组合 adapter/modules/aggregate 产出 API DTO。

- [ ] **Step 1: 写失败测试 `tests/graph/service.test.ts`**（用 Task 2 风格的内存 DB fixture）

```ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { GraphService } from '../../src/graph/service.js'

function fixture() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('c1', 'function', 'login', 'login', 'server/src/identity/service.rs', 'rust', 10, 20, '() -> R', 'public', 0)
  n.run('c2', 'function', 'create_token', 'create_token', 'server/src/common/auth.rs', 'rust', 5, 9, null, 'public', 0)
  db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`).run('c1', 'c2', 'calls')
  return db
}

describe('GraphService', () => {
  it('getGraph module overview', () => {
    const svc = new GraphService(fixture())
    const r = svc.getGraph('module', null)
    expect(r.level).toBe('module')
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['server/common', 'server/identity'])
    expect(r.edges).toEqual([{ source: 'server/identity', target: 'server/common', weight: 1 }])
  })

  it('getNode returns L0 detail by archub id', () => {
    const svc = new GraphService(fixture())
    const d = svc.getNode('rust:server/src/identity/service.rs:function:login:10')
    expect(d?.name).toBe('login')
    expect(d?.signature).toBe('() -> R')
    expect(svc.getNode('nope')).toBeNull()
  })

  it('search matches name/qualified_name and includes module', () => {
    const svc = new GraphService(fixture())
    const hits = svc.search('token')
    expect(hits).toHaveLength(1)
    expect(hits[0].name).toBe('create_token')
    expect(hits[0].module).toBe('server/common')
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test service`. Expected: FAIL（无法解析 `service.js`）。

- [ ] **Step 3: 实现 `src/graph/service.ts`**

```ts
import type Database from 'better-sqlite3'
import { loadL0Graph } from './adapter.js'
import { resolveModule, type ArchubConfig } from './modules.js'
import { aggregate } from './aggregate.js'
import type { L0Graph, Level, GraphResponse, NodeDetail, SearchHit } from './types.js'

export class GraphService {
  private readonly l0: L0Graph
  private readonly mod: (fp: string) => string

  constructor(db: Database.Database, config?: ArchubConfig) {
    this.l0 = loadL0Graph(db)
    this.mod = (fp: string) => resolveModule(fp, config)
  }

  getGraph(level: Level, scope: string | null): GraphResponse {
    const { nodes, edges } = aggregate(this.l0, level, scope, this.mod)
    return { level, scope, nodes, edges }
  }

  getNode(id: string): NodeDetail | null {
    const n = this.l0.nodes.find((x) => x.id === id)
    if (!n) return null
    return {
      id: n.id, name: n.name, qualifiedName: n.qualifiedName, kind: n.kind,
      filePath: n.filePath, language: n.language, startLine: n.startLine, endLine: n.endLine,
      signature: n.signature, visibility: n.visibility, isExported: n.isExported,
    }
  }

  search(q: string, limit = 50): SearchHit[] {
    const needle = q.toLowerCase()
    const hits: SearchHit[] = []
    for (const n of this.l0.nodes) {
      if (n.name.toLowerCase().includes(needle) || n.qualifiedName.toLowerCase().includes(needle)) {
        hits.push({ id: n.id, name: n.name, qualifiedName: n.qualifiedName, kind: n.kind, filePath: n.filePath, module: this.mod(n.filePath) })
        if (hits.length >= limit) break
      }
    }
    return hits
  }
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test service`. Expected: PASS（3 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/graph/service.ts tests/graph/service.test.ts
git commit -m "feat(graph): GraphService (getGraph/getNode/search) composing adapter+modules+aggregate"
```

---

## Task 6: REST API（express）+ 静态托管

**Files:**
- Create: `src/server/routes.ts`
- Create: `src/server/app.ts`
- Test: `tests/server/app.test.ts`

- [ ] **Step 1: 安装后端 HTTP 依赖**

Run:
```bash
cd /home/hills/projects/archub
pnpm add express
pnpm add -D supertest @types/express @types/supertest
```
Expected: 安装成功，`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 写失败测试 `tests/server/app.test.ts`**（用 supertest 打 express app，注入一个内存 DB 建的 GraphService）

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import Database from 'better-sqlite3'
import { GraphService } from '../../src/graph/service.js'
import { createApp } from '../../src/server/app.js'

function svc() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('c1', 'function', 'login', 'login', 'server/src/identity/service.rs', 'rust', 10, 20, null, 'public', 0)
  n.run('c2', 'function', 'create_token', 'create_token', 'server/src/common/auth.rs', 'rust', 5, 9, null, 'public', 0)
  db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`).run('c1', 'c2', 'calls')
  return new GraphService(db)
}

describe('REST API', () => {
  const app = createApp(svc())

  it('GET /api/graph?level=module returns module graph', async () => {
    const res = await request(app).get('/api/graph?level=module')
    expect(res.status).toBe(200)
    expect(res.body.level).toBe('module')
    expect(res.body.nodes.map((n: { id: string }) => n.id).sort()).toEqual(['server/common', 'server/identity'])
  })

  it('GET /api/graph?level=file requires module param', async () => {
    const res = await request(app).get('/api/graph?level=file')
    expect(res.status).toBe(400)
  })

  it('GET /api/node returns detail or 404', async () => {
    const ok = await request(app).get('/api/node').query({ id: 'rust:server/src/identity/service.rs:function:login:10' })
    expect(ok.status).toBe(200)
    expect(ok.body.name).toBe('login')
    const miss = await request(app).get('/api/node').query({ id: 'nope' })
    expect(miss.status).toBe(404)
  })

  it('GET /api/search returns hits', async () => {
    const res = await request(app).get('/api/search').query({ q: 'login' })
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('login')
  })
})
```

- [ ] **Step 3: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test app`. Expected: FAIL（无法解析 `app.js`）。

- [ ] **Step 4: 实现 `src/server/routes.ts`**

```ts
import { Router } from 'express'
import type { GraphService } from '../graph/service.js'
import type { Level } from '../graph/types.js'

const LEVELS: Level[] = ['module', 'file', 'function']

export function apiRouter(svc: GraphService): Router {
  const r = Router()

  // 注意(express 5 + @types/express): handler 不要 `return res.json(...)`(返回 Response 触发类型错);
  // 用 `res.json(...); return` 的早返回风格。
  r.get('/graph', (req, res) => {
    const level = String(req.query.level ?? '') as Level
    if (!LEVELS.includes(level)) { res.status(400).json({ error: `level must be one of ${LEVELS.join('|')}` }); return }
    if (level === 'file') {
      const module = req.query.module
      if (typeof module !== 'string') { res.status(400).json({ error: 'file level requires ?module=' }); return }
      res.json(svc.getGraph('file', module)); return
    }
    if (level === 'function') {
      const file = req.query.file
      if (typeof file !== 'string') { res.status(400).json({ error: 'function level requires ?file=' }); return }
      res.json(svc.getGraph('function', file)); return
    }
    res.json(svc.getGraph('module', null))
  })

  r.get('/node', (req, res) => {
    const id = req.query.id
    if (typeof id !== 'string') { res.status(400).json({ error: 'requires ?id=' }); return }
    const detail = svc.getNode(id)
    if (!detail) { res.status(404).json({ error: 'node not found' }); return }
    res.json(detail)
  })

  r.get('/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : ''
    res.json(svc.search(q))
  })

  return r
}
```

- [ ] **Step 5: 实现 `src/server/app.ts`**

```ts
import express, { type Express } from 'express'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { GraphService } from '../graph/service.js'
import { apiRouter } from './routes.js'

export function createApp(svc: GraphService): Express {
  const app = express()
  app.use('/api', apiRouter(svc))

  // 托管已构建的前端（web/dist）。开发期若未构建则跳过，不报错。
  const here = dirname(fileURLToPath(import.meta.url))
  const webDist = join(here, '..', '..', 'web', 'dist')
  if (existsSync(webDist)) {
    app.use(express.static(webDist))
    // SPA fallback。注意 express 5 不再支持 `app.get('*')`(path-to-regexp v8 移除裸 '*'),
    // 用中间件兜底 GET 非 /api 请求。
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) res.sendFile(join(webDist, 'index.html'))
      else next()
    })
  }
  return app
}
```

- [ ] **Step 6: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test app`. Expected: PASS（4 passed）。

- [ ] **Step 7: 提交**

```bash
cd /home/hills/projects/archub
git add src/server/routes.ts src/server/app.ts tests/server/app.test.ts package.json pnpm-lock.yaml
git commit -m "feat(server): express REST API for graph/node/search + static web hosting"
```

---

## Task 7: CLI —— `archub serve` 与 `archub graph`

**Files:**
- Modify: `src/cli.ts`
- Create: `src/server/serve.ts`
- Test: `tests/graph/service.test.ts` 已覆盖核心；本任务加冒烟（手动）

当前 `src/cli.ts` 结构（M1 后）：顶部 import `getVersion`、`probe/formatProbe`；注册 `probe` 命令；结尾 `program.parseAsync(...).catch(...)`。本任务在其上加 `serve` 与 `graph` 两个子命令。

- [ ] **Step 1: 实现 `src/server/serve.ts`**（打开 DB → 建 service → 起 http）

```ts
import { openCodegraphDb } from '../db/connect.js'
import { GraphService } from '../graph/service.js'
import { createApp } from './app.js'

export function startServer(projectRoot: string, port: number): void {
  const db = openCodegraphDb(projectRoot)
  const svc = new GraphService(db)
  const app = createApp(svc)
  app.listen(port, () => {
    console.log(`archub serving ${projectRoot} on http://localhost:${port}`)
  })
}
```

- [ ] **Step 2: 在 `src/cli.ts` 注册 `serve` 与 `graph`**

在 import 区加：
```ts
import { startServer } from './server/serve.js'
import { openCodegraphDb } from './db/connect.js'
import { GraphService } from './graph/service.js'
import type { Level } from './graph/types.js'
```
在 `program.parseAsync(...)` 之前加：
```ts
program
  .command('serve')
  .description('Start the archub web server (explore mode)')
  .option('-p, --project <path>', 'project root', process.cwd())
  .option('--port <n>', 'port', '4317')
  .action((opts: { project: string; port: string }) => {
    startServer(opts.project, Number(opts.port))
  })

program
  .command('graph')
  .description('Dump the aggregated graph as JSON')
  .option('-p, --project <path>', 'project root', process.cwd())
  .option('-l, --level <level>', 'module|file|function', 'module')
  .option('-m, --module <id>', 'module scope (for file level)')
  .option('-f, --file <path>', 'file scope (for function level)')
  .action((opts: { project: string; level: string; module?: string; file?: string }) => {
    const db = openCodegraphDb(opts.project)
    const svc = new GraphService(db)
    const level = opts.level as Level
    const scope = level === 'file' ? (opts.module ?? null) : level === 'function' ? (opts.file ?? null) : null
    console.log(JSON.stringify(svc.getGraph(level, scope), null, 2))
    db.close()
  })
```

- [ ] **Step 3: 构建并冒烟验证 `graph` 命令（对 lifly 真实 DB）**

Run:
```bash
cd /home/hills/projects/archub && pnpm build
node dist/cli.js graph --project /home/hills/projects/lifly --level module | head -40
```
Expected: 打印模块总览 JSON，`nodes` 含 `server/identity`、`server/common`、`server/tool` 等真实模块，`edges` 含真实模块间依赖（带 weight）。记录 nodes/edges 条数。

- [ ] **Step 4: 冒烟验证 `serve`（手动，可选）**

Run（后台起服务后用 curl 验证，再停掉）：
```bash
cd /home/hills/projects/archub
node dist/cli.js serve --project /home/hills/projects/lifly --port 4317 &
sleep 1
curl -s 'http://localhost:4317/api/graph?level=module' | head -c 300
kill %1
```
Expected: curl 返回模块图 JSON。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/cli.ts src/server/serve.ts
git commit -m "feat(cli): add 'archub serve' and 'archub graph' commands"
```

---

## Task 8: 后端对 lifly 真实 DB 的集成测试

**Files:**
- Create: `tests/integration/lifly-graph.test.ts`

- [ ] **Step 1: 写集成测试 `tests/integration/lifly-graph.test.ts`**（DB 不存在则 skip）

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { codegraphDbPath, openCodegraphDb } from '../../src/db/connect.js'
import { GraphService } from '../../src/graph/service.js'

const LIFLY = '/home/hills/projects/lifly'
const hasDb = existsSync(codegraphDbPath(LIFLY))

describe.skipIf(!hasDb)('archub graph on real lifly db', () => {
  const svc = new GraphService(openCodegraphDb(LIFLY))

  it('module overview contains real lifly backend modules', () => {
    const g = svc.getGraph('module', null)
    const ids = g.nodes.map((n) => n.id)
    expect(ids).toContain('server/identity')
    expect(ids).toContain('server/common')
    expect(g.edges.length).toBeGreaterThan(0)
    // 每条模块边的端点都应是已知模块节点
    const idset = new Set(ids)
    expect(g.edges.every((e) => idset.has(e.source) && idset.has(e.target))).toBe(true)
  })

  it('drills from a module to its files', () => {
    const files = svc.getGraph('file', 'server/identity')
    expect(files.nodes.length).toBeGreaterThan(0)
    expect(files.nodes.every((n) => n.level === 'file')).toBe(true)
  })

  it('drills from a file to its functions', () => {
    const files = svc.getGraph('file', 'server/identity')
    const aFile = files.nodes[0].id
    const fns = svc.getGraph('function', aFile)
    expect(fns.nodes.length).toBeGreaterThan(0)
    expect(fns.nodes.every((n) => n.level === 'function' && n.childCount === 1)).toBe(true)
  })

  it('search finds a known Rust symbol', () => {
    const hits = svc.search('login')
    expect(hits.some((h) => h.name === 'login')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑集成测试.** Run: `cd /home/hills/projects/archub && pnpm test lifly-graph`. Expected: PASS（4 passed；DB 已存在应实跑）。
> 若模块名断言失败，对照 `node dist/cli.js graph --project /home/hills/projects/lifly --level module` 的真实模块名调整断言（真实结构应含 server/identity 等）。

- [ ] **Step 3: 提交**

```bash
cd /home/hills/projects/archub
git add tests/integration/lifly-graph.test.ts
git commit -m "test(graph): integration test of archub graph on real lifly db"
```

---

# PART B —— 探索模式 Web UI

## Task 9: 前端工程脚手架（Vite + React 19）

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`
- Create: `web/src/api/types.ts`, `web/src/api/client.ts`
- Test: `web/tests/client.test.ts`

- [ ] **Step 1: 写 `web/package.json`**（不写死版本，下一步用 pnpm 拉真实版本）

```json
{
  "name": "archub-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 2: 安装前端依赖**

Run:
```bash
cd /home/hills/projects/archub/web
pnpm add react react-dom @xyflow/react @dagrejs/dagre
pnpm add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test
pnpm exec playwright install chromium
```
Expected: 安装成功，`web/pnpm-lock.yaml` 生成。

- [ ] **Step 3: 写 `web/vite.config.ts`**（dev 时把 `/api` 代理到后端 4317；配置 vitest jsdom）

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4317' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'] },
})
```

- [ ] **Step 4: 写 `web/tests/setup.ts`、`web/tsconfig.json`、`web/index.html`**

`web/tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>archub</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: 写 `web/src/api/types.ts`**（与 `src/graph/types.ts` 的 DTO 逐字一致）

```ts
export type Level = 'module' | 'file' | 'function'
export interface GraphNodeDTO { id: string; label: string; level: Level; kind: string; language: string | null; childCount: number; filePath: string | null }
export interface GraphEdgeDTO { source: string; target: string; weight: number }
export interface GraphResponse { level: Level; scope: string | null; nodes: GraphNodeDTO[]; edges: GraphEdgeDTO[] }
export interface NodeDetail { id: string; name: string; qualifiedName: string; kind: string; filePath: string; language: string; startLine: number; endLine: number; signature: string | null; visibility: string | null; isExported: boolean }
export interface SearchHit { id: string; name: string; qualifiedName: string; kind: string; filePath: string; module: string }
```

- [ ] **Step 6: 写失败测试 `web/tests/client.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchGraph, fetchNode, search } from '../src/api/client'

afterEach(() => vi.restoreAllMocks())

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }))
}

describe('api client', () => {
  it('fetchGraph builds module url', async () => {
    mockFetch({ level: 'module', scope: null, nodes: [], edges: [] })
    await fetchGraph('module', null)
    expect(fetch).toHaveBeenCalledWith('/api/graph?level=module')
  })
  it('fetchGraph builds file url with module scope', async () => {
    mockFetch({ level: 'file', scope: 'server/identity', nodes: [], edges: [] })
    await fetchGraph('file', 'server/identity')
    expect(fetch).toHaveBeenCalledWith('/api/graph?level=file&module=server%2Fidentity')
  })
  it('fetchNode encodes id', async () => {
    mockFetch({ name: 'login' })
    await fetchNode('rust:a.rs:function:login:10')
    expect(fetch).toHaveBeenCalledWith('/api/node?id=rust%3Aa.rs%3Afunction%3Alogin%3A10')
  })
  it('search builds query', async () => {
    mockFetch([])
    await search('tok en')
    expect(fetch).toHaveBeenCalledWith('/api/search?q=tok%20en')
  })
})
```

- [ ] **Step 7: 跑测试确认失败.** Run: `cd /home/hills/projects/archub/web && pnpm test client`. Expected: FAIL（无法解析 client）。

- [ ] **Step 8: 实现 `web/src/api/client.ts`**

```ts
import type { GraphResponse, Level, NodeDetail, SearchHit } from './types'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`request failed: ${res.status}`)
  return (await res.json()) as T
}

export function fetchGraph(level: Level, scope: string | null): Promise<GraphResponse> {
  if (level === 'file') return getJson(`/api/graph?level=file&module=${encodeURIComponent(scope ?? '')}`)
  if (level === 'function') return getJson(`/api/graph?level=function&file=${encodeURIComponent(scope ?? '')}`)
  return getJson('/api/graph?level=module')
}

export function fetchNode(id: string): Promise<NodeDetail> {
  return getJson(`/api/node?id=${encodeURIComponent(id)}`)
}

export function search(q: string): Promise<SearchHit[]> {
  return getJson(`/api/search?q=${encodeURIComponent(q)}`)
}
```

- [ ] **Step 9: 写 `web/src/App.tsx` 与 `web/src/main.tsx`**（App 暂时渲染占位，Task 12 接入 ExploreView）

`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
```

`web/src/App.tsx`:
```tsx
export function App() {
  return <div data-testid="app-root">archub</div>
}
```

- [ ] **Step 10: 跑测试确认通过 + 构建.** Run:
```bash
cd /home/hills/projects/archub/web && pnpm test client && pnpm build
```
Expected: 测试 4 passed；`vite build` 产出 `web/dist/`。

- [ ] **Step 11: 更新根 `.gitignore`** 忽略前端构建产物与依赖：追加
```
web/node_modules/
web/dist/
```
（确认根 `.gitignore` 已忽略；若已有通配 `node_modules/`/`dist/` 也可，但显式更清晰。）

- [ ] **Step 12: 提交**

```bash
cd /home/hills/projects/archub
git add web/package.json web/pnpm-lock.yaml web/vite.config.ts web/tsconfig.json web/index.html web/src/main.tsx web/src/App.tsx web/src/api/types.ts web/src/api/client.ts web/tests/setup.ts web/tests/client.test.ts .gitignore
git commit -m "feat(web): Vite/React scaffold + typed API client"
```

---

## Task 10: dagre 分层布局工具

**Files:**
- Create: `web/src/graph/layout.ts`
- Test: `web/tests/layout.test.ts`

把 `GraphResponse` 的 nodes/edges 用 dagre 算出每个节点的 `{x,y}` 坐标，返回 React Flow 可用的 `nodes`/`edges`。

- [ ] **Step 1: 写失败测试 `web/tests/layout.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { layoutGraph } from '../src/graph/layout'
import type { GraphResponse } from '../src/api/types'

const g: GraphResponse = {
  level: 'module', scope: null,
  nodes: [
    { id: 'a', label: 'a', level: 'module', kind: 'module', language: 'rust', childCount: 3, filePath: null },
    { id: 'b', label: 'b', level: 'module', kind: 'module', language: 'rust', childCount: 2, filePath: null },
  ],
  edges: [{ source: 'a', target: 'b', weight: 5 }],
}

describe('layoutGraph', () => {
  it('assigns positions to every node and carries data', () => {
    const { nodes, edges } = layoutGraph(g)
    expect(nodes).toHaveLength(2)
    expect(nodes.every((n) => typeof n.position.x === 'number' && typeof n.position.y === 'number')).toBe(true)
    const a = nodes.find((n) => n.id === 'a')!
    expect(a.data.label).toBe('a')
    expect(a.data.childCount).toBe(3)
    expect(a.type).toBe('archubNode')
  })
  it('maps edges with weight-based stroke width and ids', () => {
    const { edges } = layoutGraph(g)
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe('a')
    expect(edges[0].target).toBe('b')
    expect(edges[0].style?.strokeWidth).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub/web && pnpm test layout`. Expected: FAIL。

- [ ] **Step 3: 实现 `web/src/graph/layout.ts`**

```ts
import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { GraphResponse, GraphNodeDTO } from '../api/types'

export type ArchubNodeData = GraphNodeDTO & Record<string, unknown>
export type ArchubFlowNode = Node<ArchubNodeData> // React Flow v12 节点类型(NodeProps 泛型取 Node 类型, 非 data 类型)

const NODE_W = 180
const NODE_H = 48

export function layoutGraph(g: GraphResponse): { nodes: Node<ArchubNodeData>[]; edges: Edge[] } {
  const dg = new dagre.graphlib.Graph()
  dg.setDefaultEdgeLabel(() => ({}))
  dg.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 })
  for (const n of g.nodes) dg.setNode(n.id, { width: NODE_W, height: NODE_H })
  for (const e of g.edges) dg.setEdge(e.source, e.target)
  dagre.layout(dg)

  const nodes: Node<ArchubNodeData>[] = g.nodes.map((n) => {
    const p = dg.node(n.id)
    return {
      id: n.id,
      type: 'archubNode',
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: { ...n },
    }
  })

  const edges: Edge[] = g.edges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    label: e.weight > 1 ? String(e.weight) : undefined,
    style: { strokeWidth: Math.min(1 + Math.log2(e.weight + 1), 6) },
  }))

  return { nodes, edges }
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub/web && pnpm test layout`. Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add web/src/graph/layout.ts web/tests/layout.test.ts
git commit -m "feat(web): dagre layered layout adapter for React Flow"
```

---

## Task 11: 自定义节点组件 + 画布

**Files:**
- Create: `web/src/graph/ModuleNode.tsx`
- Create: `web/src/graph/GraphCanvas.tsx`

- [ ] **Step 1: 实现 `web/src/graph/ModuleNode.tsx`**（展示 label、kind、childCount；带 React Flow 连接点）

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ArchubFlowNode } from './layout'

export function ModuleNode({ data }: NodeProps<ArchubFlowNode>) {
  const drillable = data.level !== 'function'
  return (
    <div
      data-testid="graph-node"
      style={{
        padding: '8px 12px', border: '1px solid #888', borderRadius: 8,
        background: data.level === 'module' ? '#eef3ff' : data.level === 'file' ? '#f3f9ee' : '#fff',
        minWidth: 140, cursor: drillable ? 'pointer' : 'default',
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600, fontSize: 13 }}>{data.label}</div>
      <div style={{ fontSize: 11, color: '#666' }}>
        {data.kind}{data.level !== 'function' ? ` · ${data.childCount}` : ''}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const nodeTypes = { archubNode: ModuleNode }
```

- [ ] **Step 2: 实现 `web/src/graph/GraphCanvas.tsx`**（React Flow 画布；节点点击回调；用上 layout + nodeTypes）

```tsx
import { ReactFlow, Background, Controls, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { layoutGraph, type ArchubNodeData } from './layout'
import { nodeTypes } from './ModuleNode'
import type { GraphResponse } from '../api/types'

export function GraphCanvas({ graph, onNodeClick }: { graph: GraphResponse; onNodeClick: (node: ArchubNodeData) => void }) {
  const { nodes, edges } = layoutGraph(graph)
  return (
    <div style={{ width: '100%', height: '100%' }} data-testid="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_e, n: Node<ArchubNodeData>) => onNodeClick(n.data)}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
```

> 本任务无单测（React Flow 画布在 jsdom 下不易断言，交由 Task 12 的 ExploreView 单测与 Task 13 的 E2E 覆盖）。组件保持薄。

- [ ] **Step 3: 类型检查通过.** Run: `cd /home/hills/projects/archub/web && pnpm exec tsc -b --noEmit`. Expected: 无类型错误。

- [ ] **Step 4: 提交**

```bash
cd /home/hills/projects/archub
git add web/src/graph/ModuleNode.tsx web/src/graph/GraphCanvas.tsx
git commit -m "feat(web): custom node component + React Flow canvas"
```

---

## Task 12: 探索模式视图（下钻 + 面包屑 + 搜索 + 详情）

**Files:**
- Create: `web/src/explore/Breadcrumb.tsx`, `web/src/explore/SearchBox.tsx`, `web/src/explore/DetailPanel.tsx`, `web/src/explore/ExploreView.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/tests/ExploreView.test.tsx`

下钻状态机：`level=module`(scope=null) → 点模块 → `level=file`(scope=模块id) → 点文件 → `level=function`(scope=文件路径)。面包屑可逐级回退。

- [ ] **Step 1: 实现 `web/src/explore/Breadcrumb.tsx`**

```tsx
export interface Crumb { label: string; level: 'module' | 'file' | 'function'; scope: string | null }

export function Breadcrumb({ crumbs, onJump }: { crumbs: Crumb[]; onJump: (index: number) => void }) {
  return (
    <nav data-testid="breadcrumb" style={{ display: 'flex', gap: 6, padding: 8, fontSize: 13 }}>
      {crumbs.map((c, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: '#aaa' }}> / </span>}
          <button onClick={() => onJump(i)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}>
            {c.label}
          </button>
        </span>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: 实现 `web/src/explore/SearchBox.tsx`**

```tsx
import { useState } from 'react'
import { search } from '../api/client'
import type { SearchHit } from '../api/types'

export function SearchBox({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  async function run(value: string) {
    setQ(value)
    if (value.trim().length < 2) return setHits([])
    setHits(await search(value.trim()))
  }
  return (
    <div data-testid="search-box" style={{ padding: 8, position: 'relative' }}>
      <input placeholder="搜索符号…" value={q} onChange={(e) => run(e.target.value)} style={{ width: '100%', padding: 6 }} />
      {hits.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, position: 'absolute', background: '#fff', border: '1px solid #ddd', width: '95%', zIndex: 10, maxHeight: 240, overflow: 'auto' }}>
          {hits.map((h) => (
            <li key={h.id}>
              <button data-testid="search-hit" onClick={() => { onPick(h); setHits([]) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}>
                <b>{h.name}</b> <span style={{ color: '#888', fontSize: 11 }}>{h.module} · {h.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 实现 `web/src/explore/DetailPanel.tsx`**

```tsx
import type { NodeDetail } from '../api/types'

export function DetailPanel({ detail, onClose }: { detail: NodeDetail | null; onClose: () => void }) {
  if (!detail) return null
  return (
    <aside data-testid="detail-panel" style={{ width: 320, borderLeft: '1px solid #ddd', padding: 12, fontSize: 13, overflow: 'auto' }}>
      <button onClick={onClose} style={{ float: 'right' }}>×</button>
      <h3 style={{ marginTop: 0 }}>{detail.name}</h3>
      <div><b>kind:</b> {detail.kind}</div>
      <div><b>file:</b> {detail.filePath}:{detail.startLine}</div>
      <div><b>language:</b> {detail.language}</div>
      <div><b>visibility:</b> {detail.visibility ?? '—'}</div>
      {detail.signature && <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 8 }}>{detail.signature}</pre>}
    </aside>
  )
}
```

- [ ] **Step 4: 实现 `web/src/explore/ExploreView.tsx`**（编排：加载图、下钻、面包屑、搜索、详情）

```tsx
import { useCallback, useEffect, useState } from 'react'
import { fetchGraph, fetchNode } from '../api/client'
import type { GraphResponse, NodeDetail, SearchHit } from '../api/types'
import type { ArchubNodeData } from '../graph/layout'
import { GraphCanvas } from '../graph/GraphCanvas'
import { Breadcrumb, type Crumb } from './Breadcrumb'
import { SearchBox } from './SearchBox'
import { DetailPanel } from './DetailPanel'

const ROOT: Crumb = { label: '全部模块', level: 'module', scope: null }

export function ExploreView() {
  const [crumbs, setCrumbs] = useState<Crumb[]>([ROOT])
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const top = crumbs[crumbs.length - 1]

  useEffect(() => {
    let live = true
    fetchGraph(top.level, top.scope).then((g) => { if (live) setGraph(g) })
    return () => { live = false }
  }, [top.level, top.scope])

  const onNodeClick = useCallback(async (n: ArchubNodeData) => {
    if (n.level === 'module') setCrumbs((c) => [...c, { label: n.label, level: 'file', scope: n.id }])
    else if (n.level === 'file') setCrumbs((c) => [...c, { label: n.label, level: 'function', scope: n.id }])
    else setDetail(await fetchNode(n.id)) // function 节点 → 详情
  }, [])

  const onPickHit = useCallback(async (h: SearchHit) => {
    setDetail(await fetchNode(h.id))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ borderBottom: '1px solid #ddd' }}>
        <SearchBox onPick={onPickHit} />
        <Breadcrumb crumbs={crumbs} onJump={(i) => { setCrumbs((c) => c.slice(0, i + 1)); setDetail(null) }} />
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          {graph ? <GraphCanvas graph={graph} onNodeClick={onNodeClick} /> : <div style={{ padding: 16 }}>加载中…</div>}
        </div>
        <DetailPanel detail={detail} onClose={() => setDetail(null)} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 把 `web/src/App.tsx` 接入 ExploreView**

```tsx
import { ExploreView } from './explore/ExploreView'

export function App() {
  return <ExploreView />
}
```

- [ ] **Step 6: 写组件测试 `web/tests/ExploreView.test.tsx`**（mock api client，断言渲染 + 下钻改变请求层级；React Flow 在 jsdom 下用 mock 替身避免画布报错）

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { GraphResponse } from '../src/api/types'
import type { ArchubNodeData } from '../src/graph/layout'

// mock GraphCanvas：把节点渲染成按钮，便于触发点击下钻
vi.mock('../src/graph/GraphCanvas', () => ({
  GraphCanvas: ({ graph, onNodeClick }: { graph: GraphResponse; onNodeClick: (n: ArchubNodeData) => void }) => (
    <div data-testid="canvas">
      {graph.nodes.map((n) => (
        <button key={n.id} data-testid={`node-${n.id}`} onClick={() => onNodeClick(n as ArchubNodeData)}>{n.label}</button>
      ))}
    </div>
  ),
}))

const calls: Array<[string, string | null]> = []
vi.mock('../src/api/client', () => ({
  fetchGraph: vi.fn((level: string, scope: string | null) => {
    calls.push([level, scope])
    if (level === 'module') return Promise.resolve({ level, scope, nodes: [{ id: 'server/identity', label: 'server/identity', level: 'module', kind: 'module', language: 'rust', childCount: 2, filePath: null }], edges: [] })
    return Promise.resolve({ level, scope, nodes: [], edges: [] })
  }),
  fetchNode: vi.fn(() => Promise.resolve({ name: 'x' })),
  search: vi.fn(() => Promise.resolve([])),
}))

import { ExploreView } from '../src/explore/ExploreView'

beforeEach(() => { calls.length = 0 })

describe('ExploreView', () => {
  it('loads module overview then drills into a module', async () => {
    render(<ExploreView />)
    await waitFor(() => expect(screen.getByTestId('node-server/identity')).toBeInTheDocument())
    expect(calls[0]).toEqual(['module', null])
    fireEvent.click(screen.getByTestId('node-server/identity'))
    await waitFor(() => expect(calls.some(([l, s]) => l === 'file' && s === 'server/identity')).toBe(true))
    // 面包屑出现第二级
    expect(screen.getByText('server/identity')).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: 跑测试确认通过.** Run: `cd /home/hills/projects/archub/web && pnpm test ExploreView`. Expected: PASS（1 passed）。

- [ ] **Step 8: 类型检查 + 构建.** Run:
```bash
cd /home/hills/projects/archub/web && pnpm exec tsc -b --noEmit && pnpm build
```
Expected: 无类型错误；`web/dist/` 产出。

- [ ] **Step 9: 提交**

```bash
cd /home/hills/projects/archub
git add web/src/explore web/src/App.tsx web/tests/ExploreView.test.tsx
git commit -m "feat(web): explore view — drill-down, breadcrumb, search, detail panel"
```

---

## Task 13: E2E（Playwright，真实后端 + lifly 数据）

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/e2e/explore.spec.ts`

E2E 起真实后端（`archub serve` 指向 lifly）并由 Playwright 用 webServer 拉起 Vite dev（代理 `/api` 到后端），断言看到真实模块、能下钻、搜索能命中真实符号。

- [ ] **Step 1: 写 `web/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    {
      command: 'node ../dist/cli.js serve --project /home/hills/projects/lifly --port 4317',
      url: 'http://localhost:4317/api/graph?level=module',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
```
> 前置：跑 E2E 前需先 `cd /home/hills/projects/archub && pnpm build`（生成 `dist/cli.js`），且 lifly 的 `.codegraph/codegraph.db` 存在。

- [ ] **Step 2: 写 `web/e2e/explore.spec.ts`**（断言**具体内容值**，不止"渲染了"）

```ts
import { test, expect } from '@playwright/test'

test('explore lifly: module graph → drill into a module → search a real symbol', async ({ page }) => {
  await page.goto('/')
  // 1) 模块总览出现真实模块 server/identity
  const identity = page.getByTestId('graph-node').filter({ hasText: 'server/identity' })
  await expect(identity).toBeVisible()

  // 2) 下钻进 server/identity，面包屑出现该层级
  await identity.click()
  await expect(page.getByTestId('breadcrumb')).toContainText('server/identity')
  // 文件级应出现 .rs 文件节点
  await expect(page.getByTestId('graph-node').filter({ hasText: '.rs' }).first()).toBeVisible()

  // 3) 搜索真实 Rust 符号 login，命中并打开详情面板
  await page.getByTestId('search-box').getByRole('textbox').fill('login')
  await page.getByTestId('search-hit').filter({ hasText: 'login' }).first().click()
  await expect(page.getByTestId('detail-panel')).toContainText('login')
  await expect(page.getByTestId('detail-panel')).toContainText('service.rs')
})
```

- [ ] **Step 3: 跑 E2E.** Run:
```bash
cd /home/hills/projects/archub && pnpm build
cd web && pnpm e2e
```
Expected: 1 passed。
> 若 webServer 启动超时，确认 4317 端口空闲、lifly DB 存在、`dist/cli.js` 已构建。

- [ ] **Step 4: 提交**

```bash
cd /home/hills/projects/archub
git add web/playwright.config.ts web/e2e/explore.spec.ts
git commit -m "test(web): Playwright E2E for explore mode against real lifly data"
```

---

# PART C —— 收尾

## Task 14: M2 收尾（全量测试 + 文档 + 推送）

**Files:**
- Modify: `README.md`
- Modify: `docs/codegraph-schema.md`（可选：补一句 M2 已消费）

- [ ] **Step 1: 后端全量测试.** Run: `cd /home/hills/projects/archub && pnpm test`. Expected: 全绿（M1 的 11 + M2 新增：id 2 + adapter 3 + modules 7 + aggregate 3 + service 3 + app 4 + lifly-graph 4 = 37 左右；以实际为准，全部 PASS）。

- [ ] **Step 2: 前端全量测试.** Run: `cd /home/hills/projects/archub/web && pnpm test`. Expected: 全绿（client 4 + layout 2 + ExploreView 1 = 7）。

- [ ] **Step 3: 端到端构建验证.** Run:
```bash
cd /home/hills/projects/archub && pnpm build
cd web && pnpm build
cd /home/hills/projects/archub
node dist/cli.js serve --project /home/hills/projects/lifly --port 4317 &
sleep 1
curl -s 'http://localhost:4317/api/graph?level=module' | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4317/   # 应 200, 托管 web/dist/index.html
kill %1
```
Expected: API 返回模块 JSON；`/` 返回 200（托管前端）。

- [ ] **Step 4: 更新 `README.md`** 的状态与用法：把状态改为 "M2（探索模式）已完成"，补 `archub serve` / `archub graph` 用法与前端开发说明（`cd web && pnpm dev`）。

- [ ] **Step 5: 提交并推送**

```bash
cd /home/hills/projects/archub
git add README.md docs/codegraph-schema.md
git commit -m "docs: M2 complete — graph engine + REST API + explore-mode web UI"
git push
```
Expected: 推送成功，`origin/main` 更新。

---

## M2 完成判据（Definition of Done）

- 后端 `pnpm test` 全绿，含对 lifly 真实 DB 的 `lifly-graph` 集成测试。
- 前端 `web/ pnpm test` 全绿；`web/ pnpm e2e` 的探索 E2E 通过（断言真实 lifly 模块/符号）。
- `node dist/cli.js graph --project <repo> --level module` 输出真实模块图 JSON。
- `node dist/cli.js serve --project <repo>` 起服务，浏览器打开能看到模块图、下钻到文件/函数、搜索符号、看详情。
- 所有改动已提交并推送。

**M2 完成后**：进入 M3（向前快照 + git 集成 + diff 引擎 + 对比模式 UI）。L0 图模型与稳定 ID 已就绪，快照可直接序列化 `loadL0Graph` 的输出。
