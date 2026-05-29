# archub M3: 向前快照 + git 集成 + diff 引擎 + 对比模式 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M2 的图引擎之上加入"按 git commit 的架构 diff review"能力：向前快照（按 SHA 序列化完整 L0 图）、git 集成、在选定层级上算增/删/变的 diff 引擎、Markdown 报告，以及前端对比模式（base/head 选择 + 并集着色图 + 分组文字报告）。

**Architecture:** 快照 = 序列化 M2 `loadL0Graph` 的输出（完整 L0 图）到目标项目 `.archub/snapshots/<sha>.json.gz` + 索引；diff 引擎复用 M2 的 `aggregate`，把 base/head 两份 L0 图各自聚合到选定层级后做集合 diff（节点增/删 + "出边集合变化"判变 + 边增/删）；DiffService 把 ref（sha / branch / 当前工作区 WORKING）解析为 L0 图再 diff；REST 加 `/api/refs` 与 `/api/diff`；前端加对比模式视图。

**Tech Stack:** 沿用 M2（Node ≥20 + TS ESM · better-sqlite3 · express · vitest · React 19 + Vite + @xyflow/react + @dagrejs/dagre）。新增后端依赖 **`simple-git`**（git 集成）；快照压缩用内置 `node:zlib`。

---

> **里程碑路线图（本计划覆盖 M3）**
> - M1（完成）：地基 + codegraph 验证 + schema 探明。
> - M2（完成）：图引擎 + 聚合 + REST API + 探索模式 Web UI。
> - **M3（本计划）**：向前快照 + git 集成 + diff 引擎 + 对比模式 UI（图高亮 + Markdown 报告）。
> - M4：DB 变化检测 + SSE/WS 实时刷新 + 打磨。
> 设计全文见 `docs/specs/2026-05-29-archub-design.md` 第 5、6.2 节。

## 本计划明确不做（勿越界）
- DB 文件变化检测、SSE/WS 实时刷新（M4）。
- rename/move 检测（spec 5.2：v1 视为 删除+新增）。
- 路线 B：按需 checkout 历史 commit 重建索引（spec 5.7）。M3 只支持"向前快照"——只能 diff 已存档的 SHA 或当前工作区。
- 前端→后端契约边（spec 10）。

---

## 关键技术决策（执行者勿自行更改）

1. **快照存储位置**：目标项目根下 `.archub/snapshots/`，每个快照 `<sha>.json.gz`（gzip 的 JSON），加 `index.json`（SHA → 时间 / message）。首次写入时在 `.archub/.gitignore` 写入 `*\n`，使目标仓库不提交快照（与 codegraph 的 `.codegraph/.gitignore` 同思路）。archub 自己的 `.gitignore` 也忽略 `.archub/`（用于 dogfood lifly 时 archub 仓库无关，但 lifly 仓库需要——故写进目标项目）。
2. **git 库**：`simple-git`。**其真实 API 在 Task 1 先确认**（见该任务的确认步骤），不臆测。
3. **ref 语义**：diff 的 base/head 取值为以下之一——一个 commit SHA、一个分支名、或字面量 `WORKING`（当前工作区实时图）。branch 经 git 解析到其 HEAD sha。
4. **diff 在选定层级计算**（spec 5.4）：对 base/head 两份**完整 L0 图**各自 `aggregate(l0, level, scope, mod)`，再 diff 聚合结果。下钻在对比模式可用（换 level/scope 重算）。
5. **"变化节点"判定**（spec 5.4）：节点 id 两边都在，但其**出边集合**（出边的 `target→weight` 映射）不同 → `changed`。
6. **边 diff**：按 `(source,target)` 键，仅在一侧出现 → `added`/`removed`；两侧都在 → `unchanged`（即便 weight 变化，边本身算 unchanged，但其源节点会因出边变化被判 `changed`）。
7. **缺快照处理**（spec 5.7）：请求的 ref 解析出的 sha 无快照 → 抛清晰错误，列出已有快照，不静默出错。
8. **对比模式与探索模式**通过前端顶部模式切换共存；后端 `createApp` 扩展为可选接入 diff 依赖（向后兼容 M2 的 `createApp(graph)` 调用与测试）。

---

## API 契约 / 共享类型（后端 `src/diff/types.ts`；前端 `web/src/api/types.ts` 追加同名副本）

```ts
import type { Level, GraphNodeDTO, GraphEdgeDTO } from '../graph/types.js' // (后端) 前端从 './types' 同文件

export type NodeDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'
export type EdgeDiffStatus = 'added' | 'removed' | 'unchanged'

export interface DiffNode extends GraphNodeDTO { status: NodeDiffStatus }
export interface DiffEdge extends GraphEdgeDTO { status: EdgeDiffStatus }

export interface DiffSummary {
  addedNodes: number; removedNodes: number; changedNodes: number
  addedEdges: number; removedEdges: number
}

export interface GraphDiff {
  level: Level
  scope: string | null
  base: string   // 解析后的展示标签（如 "main@1a2b3c4d" 或 "working tree"）
  head: string
  nodes: DiffNode[]   // 并集，逐个带 status
  edges: DiffEdge[]   // 并集，逐个带 status
  summary: DiffSummary
}

export interface CommitInfo { sha: string; message: string; date: string }
export interface RefInfo {
  currentSha: string
  branches: string[]
  commits: CommitInfo[]        // 最近 ≤30 条
  snapshots: string[]          // 已有快照的 sha 列表
}
```

> 前端副本：把上面这些放进 `web/src/api/types.ts`，其中 `DiffNode`/`DiffEdge` 直接用前端已有的 `GraphNodeDTO`/`GraphEdgeDTO`（同文件）扩展。字段名/类型必须与后端逐字一致。

**端点（M3 新增）：**
- `GET /api/refs` → `RefInfo`（填充对比模式选择器：分支 / 最近 commit / 已有快照 / 当前 sha）。
- `GET /api/diff?base=<ref>&head=<ref>&level=module|file|function[&module=<id>|&file=<path>]` → `GraphDiff`。base 缺省 `HEAD`，head 缺省 `WORKING`。ref 可为 sha / 分支名 / `WORKING`。缺快照 → 400 `{error}`（清晰提示）。

---

## File Structure（M3 涉及的文件）

```
archub/
  src/
    git/
      repo.ts          # simple-git 封装: currentSha / resolveRef / refs
    snapshot/
      store.ts         # 写/读/列 快照 (.archub/snapshots, gzip + index)
    diff/
      types.ts         # diff 共享类型
      engine.ts        # diffGraphs(baseL0, headL0, level, scope, mod) 纯函数
      report.ts        # toMarkdown(diff) 纯函数
      service.ts       # DiffService: ref → L0 图 → diff
    server/
      routes.ts        # 加 /api/refs, /api/diff（修改, 向后兼容）
      app.ts           # createApp 扩展可选 compare 依赖（修改）
      serve.ts         # 注入 GraphService + DiffService + refs（修改）
    cli.ts             # 加 snapshot / install-hook / diff（修改）
  tests/
    git/repo.test.ts
    snapshot/store.test.ts
    diff/engine.test.ts
    diff/report.test.ts
    diff/service.test.ts
    server/diff-api.test.ts
    integration/lifly-diff.test.ts
  web/
    src/
      api/types.ts            # 追加 diff 类型（修改）
      api/client.ts           # 追加 fetchRefs / fetchDiff（修改）
      graph/diffLayout.ts     # 并集图布局 + 按 status 着色
      graph/DiffNode.tsx      # 按 status 着色的节点
      compare/RefSelector.tsx
      compare/DiffReport.tsx
      compare/CompareView.tsx
      App.tsx                 # explore/compare 模式切换（修改）
    tests/
      diffClient.test.ts
      diffLayout.test.ts
      CompareView.test.tsx
    e2e/
      compare.spec.ts         # Playwright 对比模式 E2E（真实后端 + lifly）
```

---

# PART A —— 后端：快照 + git + diff

## Task 1: git 集成模块（先确认 simple-git 真实 API）

**Files:**
- Create: `src/git/repo.ts`
- Test: `tests/git/repo.test.ts`

- [ ] **Step 1: 安装并确认 simple-git 真实 API（不臆测）**

Run:
```bash
cd /home/hills/projects/archub
pnpm add simple-git
node -e "import('simple-git').then(async m => {
  const g = m.simpleGit(process.cwd());
  const head = await g.revparse(['HEAD']); console.log('revparse HEAD:', JSON.stringify(head));
  const b = await g.branchLocal(); console.log('branchLocal keys:', Object.keys(b), 'all:', b.all, 'current:', b.current);
  const log = await g.log({ maxCount: 2 }); console.log('log keys:', Object.keys(log), 'first:', JSON.stringify(log.all[0]));
})"
```
Expected: 打印出 `revparse` 返回带换行的 sha 字符串；`branchLocal()` 有 `.all`(string[]) 和 `.current`；`log({maxCount})` 有 `.all`，每项含 `hash`/`message`/`date`。**记录真实字段名**——下面的实现按这些字段写；若实际字段名不同（如 `latest`/`hash` vs `oid`），调整实现与测试以匹配真实 API，并在报告里说明。

- [ ] **Step 2: 写失败测试 `tests/git/repo.test.ts`**（在临时 git 仓库里跑真实 git）

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { GitRepo } from '../../src/git/repo.js'

let dir = ''
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'archub-git-'))
  const g = simpleGit(dir)
  await g.init()
  await g.addConfig('user.email', 'test@example.com')
  await g.addConfig('user.name', 'test')
  writeFileSync(join(dir, 'a.txt'), 'one')
  await g.add('.'); await g.commit('first commit')
  writeFileSync(join(dir, 'a.txt'), 'two')
  await g.add('.'); await g.commit('second commit')
})
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('GitRepo', () => {
  it('currentSha returns the HEAD sha (40 hex, no newline)', async () => {
    const sha = await new GitRepo(dir).currentSha()
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })
  it('resolveRef resolves HEAD and HEAD~1 to distinct shas', async () => {
    const repo = new GitRepo(dir)
    const head = await repo.resolveRef('HEAD')
    const prev = await repo.resolveRef('HEAD~1')
    expect(head).toMatch(/^[0-9a-f]{40}$/)
    expect(prev).not.toBe(head)
  })
  it('refs lists current sha, branches, and recent commits', async () => {
    const refs = await new GitRepo(dir).refs()
    expect(refs.currentSha).toMatch(/^[0-9a-f]{40}$/)
    expect(refs.branches.length).toBeGreaterThan(0)
    expect(refs.commits.map((c) => c.message)).toContain('second commit')
    expect(refs.commits[0].sha).toMatch(/^[0-9a-f]{40}$/)
  })
})
```

- [ ] **Step 3: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test repo`. Expected: FAIL（无法解析 `repo.js`）。

- [ ] **Step 3.5: 创建 `src/diff/types.ts`**（diff/git 共享类型，本计划唯一事实来源；`repo.ts` 会 import 其 `CommitInfo`/`RefInfo`。Task 3/5/6 等只使用它，不重复创建）

```ts
import type { Level, GraphNodeDTO, GraphEdgeDTO } from '../graph/types.js'

export type NodeDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'
export type EdgeDiffStatus = 'added' | 'removed' | 'unchanged'

export interface DiffNode extends GraphNodeDTO { status: NodeDiffStatus }
export interface DiffEdge extends GraphEdgeDTO { status: EdgeDiffStatus }

export interface DiffSummary {
  addedNodes: number
  removedNodes: number
  changedNodes: number
  addedEdges: number
  removedEdges: number
}

export interface GraphDiff {
  level: Level
  scope: string | null
  base: string
  head: string
  nodes: DiffNode[]
  edges: DiffEdge[]
  summary: DiffSummary
}

export interface CommitInfo { sha: string; message: string; date: string }
export interface RefInfo {
  currentSha: string
  branches: string[]
  commits: CommitInfo[]
  snapshots: string[]
}
```
（`src/diff/types.ts` 只依赖 `src/graph/types.ts` 的 `Level`/`GraphNodeDTO`/`GraphEdgeDTO`，单向依赖，无循环。）

- [ ] **Step 4: 实现 `src/git/repo.ts`**（按 Step 1 确认的真实字段；下面是预期形态）

```ts
import { simpleGit, type SimpleGit } from 'simple-git'
import type { CommitInfo, RefInfo } from '../diff/types.js'

export class GitRepo {
  private readonly git: SimpleGit
  constructor(projectRoot: string) {
    this.git = simpleGit(projectRoot)
  }

  async currentSha(): Promise<string> {
    return (await this.git.revparse(['HEAD'])).trim()
  }

  async resolveRef(ref: string): Promise<string> {
    return (await this.git.revparse([ref])).trim()
  }

  async refs(): Promise<RefInfo> {
    const currentSha = (await this.git.revparse(['HEAD'])).trim()
    const branch = await this.git.branchLocal()
    const log = await this.git.log({ maxCount: 30 })
    const commits: CommitInfo[] = log.all.map((c) => ({ sha: c.hash, message: c.message, date: c.date }))
    return { currentSha, branches: branch.all, commits, snapshots: [] } // snapshots 由上层填充
  }
}
```
> 注：`refs()` 返回的 `snapshots` 先留空数组；DiffService/路由层会用 snapshot store 填充已有快照 sha（git 模块不依赖快照存储，保持单一职责）。

- [ ] **Step 5: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test repo`. Expected: PASS（3 passed）。

- [ ] **Step 6: 提交**

```bash
cd /home/hills/projects/archub
git add src/diff/types.ts src/git/repo.ts tests/git/repo.test.ts package.json pnpm-lock.yaml
git commit -m "feat(git+diff): diff/git shared types + simple-git wrapper (currentSha/resolveRef/refs)"
```

---

## Task 2: 快照存储模块

**Files:**
- Create: `src/snapshot/store.ts`
- Test: `tests/snapshot/store.test.ts`

- [ ] **Step 1: 写失败测试 `tests/snapshot/store.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSnapshot, readSnapshot, listSnapshots } from '../../src/snapshot/store.js'
import type { L0Graph } from '../../src/graph/types.js'

let dir = ''
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = '' })

const graph: L0Graph = {
  nodes: [{ id: 'rust:a.rs:function:f:1', cgId: 'c1', kind: 'function', name: 'f', qualifiedName: 'f', filePath: 'a.rs', language: 'rust', startLine: 1, endLine: 2, signature: null, visibility: null, isExported: false }],
  edges: [],
}

describe('snapshot store', () => {
  it('writes a gzipped snapshot + index and reads it back', () => {
    dir = mkdtempSync(join(tmpdir(), 'archub-snap-'))
    writeSnapshot(dir, { sha: 'abc123', createdAt: 1000, message: 'msg', graph })
    expect(existsSync(join(dir, '.archub', 'snapshots', 'abc123.json.gz'))).toBe(true)
    const back = readSnapshot(dir, 'abc123')
    expect(back?.graph.nodes[0].name).toBe('f')
    expect(back?.message).toBe('msg')
  })

  it('writes a .archub/.gitignore so the target repo ignores snapshots', () => {
    dir = mkdtempSync(join(tmpdir(), 'archub-snap-'))
    writeSnapshot(dir, { sha: 'abc123', createdAt: 1000, message: 'm', graph })
    expect(readFileSync(join(dir, '.archub', '.gitignore'), 'utf8')).toContain('*')
  })

  it('listSnapshots returns metas; re-writing the same sha de-dups', () => {
    dir = mkdtempSync(join(tmpdir(), 'archub-snap-'))
    writeSnapshot(dir, { sha: 's1', createdAt: 1, message: 'a', graph })
    writeSnapshot(dir, { sha: 's2', createdAt: 2, message: 'b', graph })
    writeSnapshot(dir, { sha: 's1', createdAt: 3, message: 'a2', graph }) // 覆盖 s1
    const metas = listSnapshots(dir)
    expect(metas.map((m) => m.sha).sort()).toEqual(['s1', 's2'])
    expect(metas.find((m) => m.sha === 's1')!.message).toBe('a2')
  })

  it('readSnapshot returns null for a missing sha', () => {
    dir = mkdtempSync(join(tmpdir(), 'archub-snap-'))
    expect(readSnapshot(dir, 'nope')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test store`. Expected: FAIL（无法解析 `store.js`）。

- [ ] **Step 3: 实现 `src/snapshot/store.ts`**

```ts
import { gzipSync, gunzipSync } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { L0Graph } from '../graph/types.js'

export interface Snapshot {
  sha: string
  createdAt: number
  message: string
  graph: L0Graph
}
export interface SnapshotMeta {
  sha: string
  createdAt: number
  message: string
}

function snapDir(projectRoot: string): string {
  return join(projectRoot, '.archub', 'snapshots')
}

export function writeSnapshot(projectRoot: string, snap: Snapshot): void {
  const dir = snapDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  const ignore = join(projectRoot, '.archub', '.gitignore')
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n')
  writeFileSync(join(dir, `${snap.sha}.json.gz`), gzipSync(Buffer.from(JSON.stringify(snap))))
  const idxPath = join(dir, 'index.json')
  const idx: SnapshotMeta[] = existsSync(idxPath)
    ? (JSON.parse(readFileSync(idxPath, 'utf8')) as SnapshotMeta[])
    : []
  const next = idx.filter((m) => m.sha !== snap.sha)
  next.push({ sha: snap.sha, createdAt: snap.createdAt, message: snap.message })
  writeFileSync(idxPath, JSON.stringify(next, null, 2))
}

export function readSnapshot(projectRoot: string, sha: string): Snapshot | null {
  const p = join(snapDir(projectRoot), `${sha}.json.gz`)
  if (!existsSync(p)) return null
  return JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')) as Snapshot
}

export function listSnapshots(projectRoot: string): SnapshotMeta[] {
  const idxPath = join(snapDir(projectRoot), 'index.json')
  if (!existsSync(idxPath)) return []
  return JSON.parse(readFileSync(idxPath, 'utf8')) as SnapshotMeta[]
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test store`. Expected: PASS（4 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/snapshot/store.ts tests/snapshot/store.test.ts
git commit -m "feat(snapshot): gzipped per-SHA L0 graph snapshots + index store"
```

---

## Task 3: diff 引擎（纯函数，复用 M2 聚合）

**Files:**
- Create: `src/diff/engine.ts`
- Test: `tests/diff/engine.test.ts`
- （`src/diff/types.ts` 已在 Task 1 创建。）

- [ ] **Step 1: 写失败测试 `tests/diff/engine.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { diffGraphs } from '../../src/diff/engine.js'
import { defaultModule } from '../../src/graph/modules.js'
import type { L0Graph, L0Node } from '../../src/graph/types.js'

const mod = (fp: string) => defaultModule(fp)
function n(file: string, name: string, line: number): L0Node {
  return { id: `rust:${file}:function:${name}:${line}`, cgId: name, kind: 'function', name, qualifiedName: name, filePath: file, language: 'rust', startLine: line, endLine: line + 1, signature: null, visibility: null, isExported: false }
}
const A = n('server/src/identity/a.rs', 'a', 1)
const B = n('server/src/common/b.rs', 'b', 1)
const C = n('server/src/tool/c.rs', 'c', 1)

describe('diffGraphs (module level)', () => {
  it('detects added/removed modules and added/removed edges', () => {
    const base: L0Graph = { nodes: [A, B], edges: [{ source: A.id, target: B.id, kind: 'calls' }] }
    const head: L0Graph = { nodes: [A, C], edges: [{ source: A.id, target: C.id, kind: 'calls' }] }
    const d = diffGraphs(base, head, 'module', null, mod, 'base', 'head')
    const byId = Object.fromEntries(d.nodes.map((x) => [x.id, x.status]))
    expect(byId['server/common']).toBe('removed')
    expect(byId['server/tool']).toBe('added')
    expect(byId['server/identity']).toBe('changed') // 出边从 →common 变成 →tool
    const edge = (s: string, t: string) => d.edges.find((e) => e.source === s && e.target === t)
    expect(edge('server/identity', 'server/common')!.status).toBe('removed')
    expect(edge('server/identity', 'server/tool')!.status).toBe('added')
    expect(d.summary).toEqual({ addedNodes: 1, removedNodes: 1, changedNodes: 1, addedEdges: 1, removedEdges: 1 })
  })

  it('marks a node unchanged when its out-edges are identical', () => {
    const g: L0Graph = { nodes: [A, B], edges: [{ source: A.id, target: B.id, kind: 'calls' }] }
    const d = diffGraphs(g, g, 'module', null, mod, 'base', 'head')
    expect(d.nodes.every((x) => x.status === 'unchanged')).toBe(true)
    expect(d.edges.every((e) => e.status === 'unchanged')).toBe(true)
    expect(d.summary).toEqual({ addedNodes: 0, removedNodes: 0, changedNodes: 0, addedEdges: 0, removedEdges: 0 })
  })

  it('marks a node changed when an out-edge weight changes (more underlying L0 edges)', () => {
    const A2 = n('server/src/identity/a.rs', 'a2', 5)
    const base: L0Graph = { nodes: [A, B], edges: [{ source: A.id, target: B.id, kind: 'calls' }] }
    const head: L0Graph = { nodes: [A, A2, B], edges: [{ source: A.id, target: B.id, kind: 'calls' }, { source: A2.id, target: B.id, kind: 'calls' }] }
    // identity→common weight: base 1, head 2 → identity 节点 changed, 边 status 仍 unchanged
    const d = diffGraphs(base, head, 'module', null, mod, 'base', 'head')
    expect(d.nodes.find((x) => x.id === 'server/identity')!.status).toBe('changed')
    expect(d.edges.find((e) => e.source === 'server/identity' && e.target === 'server/common')!.status).toBe('unchanged')
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test diff/engine`. Expected: FAIL（无法解析 `engine.js`）。

- [ ] **Step 3: 实现 `src/diff/engine.ts`**

```ts
import { aggregate } from '../graph/aggregate.js'
import type { L0Graph, Level, GraphEdgeDTO } from '../graph/types.js'
import type { GraphDiff, DiffNode, DiffEdge } from './types.js'

type ResolveModule = (filePath: string) => string

function edgeKey(source: string, target: string): string {
  return `${source} ${target}`
}

/** 每个容器节点的出边映射: nodeId -> (targetId -> weight) */
function outgoing(edges: GraphEdgeDTO[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const e of edges) {
    if (!m.has(e.source)) m.set(e.source, new Map())
    m.get(e.source)!.set(e.target, e.weight)
  }
  return m
}

function sameOutgoing(a: Map<string, number> | undefined, b: Map<string, number> | undefined): boolean {
  const am = a ?? new Map<string, number>()
  const bm = b ?? new Map<string, number>()
  if (am.size !== bm.size) return false
  for (const [t, w] of am) if (bm.get(t) !== w) return false
  return true
}

export function diffGraphs(
  baseL0: L0Graph,
  headL0: L0Graph,
  level: Level,
  scope: string | null,
  mod: ResolveModule,
  baseLabel: string,
  headLabel: string,
): GraphDiff {
  const A = aggregate(baseL0, level, scope, mod)
  const B = aggregate(headL0, level, scope, mod)

  const aNodes = new Map(A.nodes.map((n) => [n.id, n]))
  const bNodes = new Map(B.nodes.map((n) => [n.id, n]))
  const aOut = outgoing(A.edges)
  const bOut = outgoing(B.edges)

  const nodes: DiffNode[] = []
  for (const id of new Set([...aNodes.keys(), ...bNodes.keys()])) {
    const inA = aNodes.has(id)
    const inB = bNodes.has(id)
    const dto = bNodes.get(id) ?? aNodes.get(id)!
    let status: DiffNode['status']
    if (inA && !inB) status = 'removed'
    else if (!inA && inB) status = 'added'
    else status = sameOutgoing(aOut.get(id), bOut.get(id)) ? 'unchanged' : 'changed'
    nodes.push({ ...dto, status })
  }

  const aEdges = new Map(A.edges.map((e) => [edgeKey(e.source, e.target), e]))
  const bEdges = new Map(B.edges.map((e) => [edgeKey(e.source, e.target), e]))
  const edges: DiffEdge[] = []
  for (const k of new Set([...aEdges.keys(), ...bEdges.keys()])) {
    const inA = aEdges.has(k)
    const inB = bEdges.has(k)
    const e = bEdges.get(k) ?? aEdges.get(k)!
    const status: DiffEdge['status'] = inA && !inB ? 'removed' : !inA && inB ? 'added' : 'unchanged'
    edges.push({ ...e, status })
  }

  const summary = {
    addedNodes: nodes.filter((n) => n.status === 'added').length,
    removedNodes: nodes.filter((n) => n.status === 'removed').length,
    changedNodes: nodes.filter((n) => n.status === 'changed').length,
    addedEdges: edges.filter((e) => e.status === 'added').length,
    removedEdges: edges.filter((e) => e.status === 'removed').length,
  }

  return { level, scope, base: baseLabel, head: headLabel, nodes, edges, summary }
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test diff/engine`. Expected: PASS（3 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/diff/engine.ts tests/diff/engine.test.ts
git commit -m "feat(diff): graph diff engine (added/removed/changed nodes + edge diff) over aggregated graphs"
```

---

## Task 4: Markdown 报告生成

**Files:**
- Create: `src/diff/report.ts`
- Test: `tests/diff/report.test.ts`

- [ ] **Step 1: 写失败测试 `tests/diff/report.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { toMarkdown } from '../../src/diff/report.js'
import type { GraphDiff } from '../../src/diff/types.js'

const diff: GraphDiff = {
  level: 'module', scope: null, base: 'main@aaaa', head: 'working tree',
  nodes: [
    { id: 'server/tool', label: 'server/tool', level: 'module', kind: 'module', language: 'rust', childCount: 3, filePath: null, status: 'added' },
    { id: 'server/legacy', label: 'server/legacy', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'removed' },
    { id: 'server/capability', label: 'server/capability', level: 'module', kind: 'module', language: 'rust', childCount: 2, filePath: null, status: 'changed' },
    { id: 'server/common', label: 'server/common', level: 'module', kind: 'module', language: 'rust', childCount: 9, filePath: null, status: 'unchanged' },
  ],
  edges: [
    { source: 'server/capability', target: 'server/intelligence', weight: 1, status: 'added' },
    { source: 'server/tool', target: 'server/data', weight: 2, status: 'removed' },
    { source: 'server/identity', target: 'server/common', weight: 5, status: 'unchanged' },
  ],
  summary: { addedNodes: 1, removedNodes: 1, changedNodes: 1, addedEdges: 1, removedEdges: 1 },
}

describe('toMarkdown', () => {
  it('renders a grouped report with a summary line', () => {
    const md = toMarkdown(diff)
    expect(md).toContain('main@aaaa → working tree')
    expect(md).toContain('+1 / -1 nodes')
    expect(md).toContain('## Added')
    expect(md).toContain('+ server/tool')
    expect(md).toContain('## Removed')
    expect(md).toContain('- server/legacy')
    expect(md).toContain('## Changed')
    expect(md).toContain('~ server/capability')
    expect(md).toContain('## Added edges')
    expect(md).toContain('server/capability → server/intelligence')
    expect(md).toContain('## Removed edges')
    expect(md).toContain('server/tool → server/data')
  })

  it('omits empty sections and reports no changes', () => {
    const empty: GraphDiff = { ...diff, nodes: diff.nodes.filter((n) => n.status === 'unchanged'), edges: diff.edges.filter((e) => e.status === 'unchanged'), summary: { addedNodes: 0, removedNodes: 0, changedNodes: 0, addedEdges: 0, removedEdges: 0 } }
    const md = toMarkdown(empty)
    expect(md).toContain('No architecture changes')
    expect(md).not.toContain('## Added')
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test report`. Expected: FAIL。

- [ ] **Step 3: 实现 `src/diff/report.ts`**

```ts
import type { GraphDiff } from './types.js'

export function toMarkdown(d: GraphDiff): string {
  const lines: string[] = []
  lines.push(`# Architecture diff: ${d.base} → ${d.head} (${d.level} level)`)
  lines.push('')
  const s = d.summary
  const total = s.addedNodes + s.removedNodes + s.changedNodes + s.addedEdges + s.removedEdges
  if (total === 0) {
    lines.push('No architecture changes.')
    return lines.join('\n')
  }
  lines.push(`**Summary:** +${s.addedNodes} / -${s.removedNodes} nodes, ~${s.changedNodes} changed; +${s.addedEdges} / -${s.removedEdges} edges.`)
  lines.push('')

  const section = (title: string, items: string[]) => {
    if (items.length === 0) return
    lines.push(`## ${title}`)
    for (const it of items) lines.push(`- ${it}`)
    lines.push('')
  }

  section('Added', d.nodes.filter((n) => n.status === 'added').map((n) => `+ ${n.label}`))
  section('Removed', d.nodes.filter((n) => n.status === 'removed').map((n) => `- ${n.label}`))
  section('Changed', d.nodes.filter((n) => n.status === 'changed').map((n) => `~ ${n.label} (dependencies changed)`))
  section('Added edges', d.edges.filter((e) => e.status === 'added').map((e) => `+ ${e.source} → ${e.target} (×${e.weight})`))
  section('Removed edges', d.edges.filter((e) => e.status === 'removed').map((e) => `- ${e.source} → ${e.target}`))

  return lines.join('\n')
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test report`. Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/diff/report.ts tests/diff/report.test.ts
git commit -m "feat(diff): grouped Markdown report from a GraphDiff"
```

---

## Task 5: DiffService（ref → L0 图 → diff）

**Files:**
- Create: `src/diff/service.ts`
- Test: `tests/diff/service.test.ts`

- [ ] **Step 1: 写失败测试 `tests/diff/service.test.ts`**（内存 DB 作"工作区"，临时 git 仓库 + 写真实快照）

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { simpleGit } from 'simple-git'
import { writeSnapshot } from '../../src/snapshot/store.js'
import { DiffService, WORKING } from '../../src/diff/service.js'
import { loadL0Graph } from '../../src/graph/adapter.js'

function workingDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  db.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = db.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('c1', 'function', 'login', 'login', 'server/src/identity/service.rs', 'rust', 10, 20, null, 'public', 0)
  n.run('c2', 'function', 'create_token', 'create_token', 'server/src/common/auth.rs', 'rust', 5, 9, null, 'public', 0)
  db.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`).run('c1', 'c2', 'calls')
  return db
}

let dir = ''
let baseSha = ''
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'archub-diffsvc-'))
  const g = simpleGit(dir)
  await g.init(); await g.addConfig('user.email', 't@e.com'); await g.addConfig('user.name', 't')
  writeFileSync(join(dir, 'x.txt'), '1'); await g.add('.'); await g.commit('base')
  baseSha = (await g.revparse(['HEAD'])).trim()
  // base 快照 = 一个只有 identity 模块、无跨模块边的图（与工作区不同）
  writeSnapshot(dir, { sha: baseSha, createdAt: 1, message: 'base', graph: { nodes: [
    { id: 'rust:server/src/identity/service.rs:function:login:10', cgId: 'c1', kind: 'function', name: 'login', qualifiedName: 'login', filePath: 'server/src/identity/service.rs', language: 'rust', startLine: 10, endLine: 20, signature: null, visibility: null, isExported: false },
  ], edges: [] } })
})
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('DiffService', () => {
  it('diffs a stored base snapshot against the live WORKING tree', async () => {
    const svc = new DiffService(dir, workingDb())
    const d = await svc.diff(baseSha, WORKING, 'module', null)
    const byId = Object.fromEntries(d.nodes.map((n) => [n.id, n.status]))
    // 工作区新增了 server/common 模块和 identity→common 边
    expect(byId['server/common']).toBe('added')
    expect(byId['server/identity']).toBe('changed')
    expect(d.edges.find((e) => e.source === 'server/identity' && e.target === 'server/common')!.status).toBe('added')
    expect(d.head).toContain('working')
  })

  it('throws a clear error when the base ref has no snapshot', async () => {
    const g = simpleGit(dir)
    writeFileSync(join(dir, 'y.txt'), '2'); await g.add('.'); await g.commit('second (no snapshot)')
    const svc = new DiffService(dir, workingDb())
    await expect(svc.diff('HEAD', WORKING, 'module', null)).rejects.toThrow(/No snapshot/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test diff/service`. Expected: FAIL（无法解析 `service.js`）。

- [ ] **Step 3: 实现 `src/diff/service.ts`**

```ts
import type Database from 'better-sqlite3'
import { loadL0Graph } from '../graph/adapter.js'
import { resolveModule, type ArchubConfig } from '../graph/modules.js'
import { diffGraphs } from './engine.js'
import { readSnapshot, listSnapshots } from '../snapshot/store.js'
import { GitRepo } from '../git/repo.js'
import type { L0Graph, Level } from '../graph/types.js'
import type { GraphDiff } from './types.js'

export const WORKING = 'WORKING'

export class DiffService {
  private readonly mod: (fp: string) => string
  constructor(
    private readonly projectRoot: string,
    private readonly db: Database.Database,
    config?: ArchubConfig,
  ) {
    this.mod = (fp: string) => resolveModule(fp, config)
  }

  private async resolveGraph(ref: string): Promise<{ label: string; graph: L0Graph }> {
    if (ref === WORKING) return { label: 'working tree', graph: loadL0Graph(this.db) }
    const sha = await new GitRepo(this.projectRoot).resolveRef(ref)
    const snap = readSnapshot(this.projectRoot, sha)
    if (!snap) {
      const have = listSnapshots(this.projectRoot).map((m) => m.sha.slice(0, 8))
      throw new Error(
        `No snapshot for ${ref} (${sha.slice(0, 8)}). ` +
          (have.length ? `Snapshots exist for: ${have.join(', ')}.` : 'No snapshots yet.') +
          ' Snapshots are recorded going forward — run `archub snapshot` or install the post-commit hook.',
      )
    }
    return { label: `${ref}@${sha.slice(0, 8)}`, graph: snap.graph }
  }

  async diff(base: string, head: string, level: Level, scope: string | null): Promise<GraphDiff> {
    const b = await this.resolveGraph(base)
    const h = await this.resolveGraph(head)
    return diffGraphs(b.graph, h.graph, level, scope, this.mod, b.label, h.label)
  }
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub && pnpm test diff/service`. Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/diff/service.ts tests/diff/service.test.ts
git commit -m "feat(diff): DiffService resolving refs (sha/branch/WORKING) to L0 graphs"
```

---

## Task 6: REST API —— `/api/refs` 与 `/api/diff`

**Files:**
- Modify: `src/server/routes.ts`
- Modify: `src/server/app.ts`
- Test: `tests/server/diff-api.test.ts`

当前 M2 的 `apiRouter(svc: GraphService)` 与 `createApp(svc: GraphService)`。本任务**向后兼容地**加入可选 compare 依赖。

- [ ] **Step 1: 写失败测试 `tests/server/diff-api.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { simpleGit } from 'simple-git'
import { GraphService } from '../../src/graph/service.js'
import { DiffService, WORKING } from '../../src/diff/service.js'
import { GitRepo } from '../../src/git/repo.js'
import { writeSnapshot, listSnapshots } from '../../src/snapshot/store.js'
import { createApp } from '../../src/server/app.js'

function db() {
  const d = new Database(':memory:')
  d.exec(`CREATE TABLE nodes (id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INT, end_line INT, signature TEXT, visibility TEXT, is_exported INT);`)
  d.exec(`CREATE TABLE edges (id INTEGER PRIMARY KEY, source TEXT, target TEXT, kind TEXT, metadata TEXT, line INT, col INT, provenance TEXT);`)
  const n = d.prepare(`INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  n.run('c1', 'function', 'login', 'login', 'server/src/identity/service.rs', 'rust', 10, 20, null, 'public', 0)
  n.run('c2', 'function', 'create_token', 'create_token', 'server/src/common/auth.rs', 'rust', 5, 9, null, 'public', 0)
  d.prepare(`INSERT INTO edges (source,target,kind) VALUES (?,?,?)`).run('c1', 'c2', 'calls')
  return d
}

let dir = ''
let baseSha = ''
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'archub-diffapi-'))
  const g = simpleGit(dir)
  await g.init(); await g.addConfig('user.email', 't@e.com'); await g.addConfig('user.name', 't')
  writeFileSync(join(dir, 'x.txt'), '1'); await g.add('.'); await g.commit('base')
  baseSha = (await g.revparse(['HEAD'])).trim()
  writeSnapshot(dir, { sha: baseSha, createdAt: 1, message: 'base', graph: { nodes: [
    { id: 'rust:server/src/identity/service.rs:function:login:10', cgId: 'c1', kind: 'function', name: 'login', qualifiedName: 'login', filePath: 'server/src/identity/service.rs', language: 'rust', startLine: 10, endLine: 20, signature: null, visibility: null, isExported: false },
  ], edges: [] } })
})
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

function app() {
  const sharedDb = db()
  const graph = new GraphService(sharedDb)
  const diff = new DiffService(dir, sharedDb)
  const refs = async () => {
    const r = await new GitRepo(dir).refs()
    return { ...r, snapshots: listSnapshots(dir).map((m) => m.sha) }
  }
  return createApp(graph, { diff, refs })
}

describe('diff REST API', () => {
  it('GET /api/refs returns branches/commits/snapshots/currentSha', async () => {
    const res = await request(app()).get('/api/refs')
    expect(res.status).toBe(200)
    expect(res.body.currentSha).toMatch(/^[0-9a-f]{40}$/)
    expect(res.body.snapshots).toContain(baseSha)
    expect(Array.isArray(res.body.branches)).toBe(true)
  })

  it('GET /api/diff?base=<sha>&head=WORKING returns a diff', async () => {
    const res = await request(app()).get('/api/diff').query({ base: baseSha, head: WORKING, level: 'module' })
    expect(res.status).toBe(200)
    const byId = Object.fromEntries(res.body.nodes.map((n: { id: string; status: string }) => [n.id, n.status]))
    expect(byId['server/common']).toBe('added')
  })

  it('GET /api/diff with a base that has no snapshot returns 400', async () => {
    const res = await request(app()).get('/api/diff').query({ base: 'HEAD~99', head: WORKING, level: 'module' })
    expect(res.status).toBe(400)
  })

  it('GET /api/diff requires base & head', async () => {
    const res = await request(app()).get('/api/diff').query({ level: 'module' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub && pnpm test diff-api`. Expected: FAIL（`createApp` 还不接受第二参/无 diff 路由）。

- [ ] **Step 3: 修改 `src/server/routes.ts`**

完整替换为（保留 M2 的 graph/node/search，新增 compare 依赖与 refs/diff 路由）：
```ts
import { Router } from 'express'
import type { GraphService } from '../graph/service.js'
import type { DiffService } from '../diff/service.js'
import type { Level } from '../graph/types.js'
import type { RefInfo } from '../diff/types.js'

const LEVELS: Level[] = ['module', 'file', 'function']

export interface CompareDeps {
  diff: DiffService
  refs: () => Promise<RefInfo>
}

export function apiRouter(svc: GraphService, compare?: CompareDeps): Router {
  const r = Router()

  // 注意(express 5 + @types/express): 不要 `return res.json(...)`; 用 `res.json(...); return`。
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

  if (compare) {
    r.get('/refs', async (_req, res) => {
      res.json(await compare.refs())
    })

    r.get('/diff', async (req, res) => {
      const base = req.query.base
      const head = req.query.head
      if (typeof base !== 'string' || typeof head !== 'string') {
        res.status(400).json({ error: 'requires ?base= and ?head=' }); return
      }
      const level = String(req.query.level ?? 'module') as Level
      if (!LEVELS.includes(level)) { res.status(400).json({ error: `level must be one of ${LEVELS.join('|')}` }); return }
      const scope = level === 'file' ? (typeof req.query.module === 'string' ? req.query.module : null)
        : level === 'function' ? (typeof req.query.file === 'string' ? req.query.file : null)
        : null
      try {
        res.json(await compare.diff.diff(base, head, level, scope))
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  return r
}
```
> 依赖方向：`routes.ts` 从 `../graph/types.js` 取 `Level`、从 `../diff/types.js` 取 `RefInfo`（如上 import）。`diff/types.ts` 单向依赖 `graph/types.ts`，无循环。

- [ ] **Step 4: 修改 `src/server/app.ts`**

```ts
import express, { type Express } from 'express'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { GraphService } from '../graph/service.js'
import { apiRouter, type CompareDeps } from './routes.js'

export function createApp(svc: GraphService, compare?: CompareDeps): Express {
  const app = express()
  app.use('/api', apiRouter(svc, compare))

  const here = dirname(fileURLToPath(import.meta.url))
  const webDist = join(here, '..', '..', 'web', 'dist')
  if (existsSync(webDist)) {
    app.use(express.static(webDist))
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) res.sendFile(join(webDist, 'index.html'))
      else next()
    })
  }
  return app
}
```

- [ ] **Step 5: 跑测试确认通过 + 全量编译.** Run: `cd /home/hills/projects/archub && pnpm test diff-api && pnpm build`. Expected: diff-api 4 passed；tsc 无错误。也跑 M2 的 `pnpm test app` 确认未回归（仍 4 passed）。

- [ ] **Step 6: 提交**

```bash
cd /home/hills/projects/archub
git add src/server/routes.ts src/server/app.ts tests/server/diff-api.test.ts
git commit -m "feat(server): /api/refs and /api/diff endpoints (backward-compatible createApp)"
```

---

## Task 7: CLI —— `snapshot` / `install-hook` / `diff`，并接通 serve 的 compare 依赖

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/server/serve.ts`

- [ ] **Step 1: 修改 `src/server/serve.ts`**，把 DiffService + refs 注入 createApp

```ts
import { openCodegraphDb } from '../db/connect.js'
import { GraphService } from '../graph/service.js'
import { DiffService } from '../diff/service.js'
import { GitRepo } from '../git/repo.js'
import { listSnapshots } from '../snapshot/store.js'
import { createApp } from './app.js'

export function startServer(projectRoot: string, port: number): void {
  const db = openCodegraphDb(projectRoot)
  const graph = new GraphService(db)
  const diff = new DiffService(projectRoot, db)
  const refs = async () => {
    const r = await new GitRepo(projectRoot).refs()
    return { ...r, snapshots: listSnapshots(projectRoot).map((m) => m.sha) }
  }
  const app = createApp(graph, { diff, refs })
  app.listen(port, () => {
    console.log(`archub serving ${projectRoot} on http://localhost:${port}`)
  })
}
```

- [ ] **Step 2: 在 `src/cli.ts` 加 imports**（near other imports）

```ts
import { writeFileSync, chmodSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadL0Graph } from './graph/adapter.js'
import { GitRepo } from './git/repo.js'
import { writeSnapshot } from './snapshot/store.js'
import { DiffService, WORKING } from './diff/service.js'
import { toMarkdown } from './diff/report.js'
```
（`openCodegraphDb`、`GraphService`、`Level` 已在 M2 引入。）

- [ ] **Step 3: 在 `src/cli.ts` 注册 `snapshot` / `install-hook` / `diff`**（在 `program.parseAsync` 之前）

```ts
program
  .command('snapshot')
  .description('Snapshot the current architecture graph, keyed by git HEAD sha')
  .option('-p, --project <path>', 'project root', process.cwd())
  .action(async (opts: { project: string }) => {
    const db = openCodegraphDb(opts.project)
    const graph = loadL0Graph(db)
    db.close()
    const git = new GitRepo(opts.project)
    const sha = await git.currentSha()
    const refs = await git.refs()
    const message = refs.commits.find((c) => c.sha === sha)?.message ?? refs.commits[0]?.message ?? ''
    writeSnapshot(opts.project, { sha, createdAt: Date.now(), message, graph })
    console.log(`snapshot ${sha.slice(0, 8)} saved (${graph.nodes.length} nodes, ${graph.edges.length} edges)`)
  })

program
  .command('install-hook')
  .description('Install a git post-commit hook that runs `archub snapshot` (opt-in)')
  .option('-p, --project <path>', 'project root', process.cwd())
  .action((opts: { project: string }) => {
    const bin = fileURLToPath(import.meta.url) // dist/cli.js at runtime
    const hookPath = resolve(opts.project, '.git', 'hooks', 'post-commit')
    const script = `#!/bin/sh\n# installed by archub install-hook\nnode "${bin}" snapshot --project "${resolve(opts.project)}"\n`
    writeFileSync(hookPath, script)
    chmodSync(hookPath, 0o755)
    console.log(`installed post-commit hook → ${hookPath}`)
  })

program
  .command('diff')
  .description('Diff the architecture graph between two refs (sha/branch/WORKING)')
  .option('-p, --project <path>', 'project root', process.cwd())
  .option('--base <ref>', 'base ref', 'HEAD')
  .option('--head <ref>', 'head ref', WORKING)
  .option('-l, --level <level>', 'module|file|function', 'module')
  .option('--md', 'output a Markdown report', false)
  .action(async (opts: { project: string; base: string; head: string; level: string; md: boolean }) => {
    const db = openCodegraphDb(opts.project)
    const svc = new DiffService(opts.project, db)
    const d = await svc.diff(opts.base, opts.head, opts.level as Level, null)
    db.close()
    console.log(opts.md ? toMarkdown(d) : JSON.stringify(d.summary, null, 2))
  })
```

- [ ] **Step 4: 构建并对 lifly 实跑冒烟**（向前快照：snapshot 当前 → diff working vs 它 = 全 unchanged）

```bash
cd /home/hills/projects/archub && pnpm build
node dist/cli.js snapshot --project /home/hills/projects/lifly
node dist/cli.js diff --project /home/hills/projects/lifly --base HEAD --head WORKING --level module
node dist/cli.js diff --project /home/hills/projects/lifly --base HEAD --head WORKING --level module --md
```
Expected:
- `snapshot` 打印 `snapshot <8hex> saved (N nodes, M edges)`，并在 `/home/hills/projects/lifly/.archub/snapshots/` 生成 `<sha>.json.gz` + `index.json` + `.gitignore`。
- 第一个 `diff`：因 HEAD 快照刚存、工作区与 HEAD 同源 → summary 全 0（`{addedNodes:0,...}`）。
- `--md`：打印 `No architecture changes.`（因无变化）。
记录 snapshot 的 sha 与节点/边数。

- [ ] **Step 5: 全量测试不回归.** Run: `cd /home/hills/projects/archub && pnpm test`. Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
cd /home/hills/projects/archub
git add src/cli.ts src/server/serve.ts
git commit -m "feat(cli): snapshot / install-hook / diff commands + wire compare deps into serve"
```

---

## Task 8: 后端对 lifly 真实数据的 diff 集成测试

**Files:**
- Create: `tests/integration/lifly-diff.test.ts`

构造一个"人工变更"：以 lifly 真实 L0 图为 head，删掉其中一个模块的全部节点作为 base 快照 → diff 应报出该模块为 `added`（head 多出）。这样无需 lifly 真实 git 历史即可验证全链路。

- [ ] **Step 1: 写集成测试 `tests/integration/lifly-diff.test.ts`**（DB 不存在则 skip）

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { codegraphDbPath, openCodegraphDb } from '../../src/db/connect.js'
import { loadL0Graph } from '../../src/graph/adapter.js'
import { diffGraphs } from '../../src/diff/engine.js'
import { defaultModule } from '../../src/graph/modules.js'

const LIFLY = '/home/hills/projects/lifly'
const hasDb = existsSync(codegraphDbPath(LIFLY))
const mod = (fp: string) => defaultModule(fp)

describe.skipIf(!hasDb)('diff on real lifly graph', () => {
  it('reports a module as added when it is absent from the base graph', () => {
    const head = loadL0Graph(openCodegraphDb(LIFLY))
    // base = head 去掉 server/identity 模块的所有节点（及其端点边）
    const dropped = new Set(head.nodes.filter((n) => mod(n.filePath) === 'server/identity').map((n) => n.id))
    expect(dropped.size).toBeGreaterThan(0)
    const base = {
      nodes: head.nodes.filter((n) => !dropped.has(n.id)),
      edges: head.edges.filter((e) => !dropped.has(e.source) && !dropped.has(e.target)),
    }
    const d = diffGraphs(base, head, 'module', null, mod, 'base', 'head')
    expect(d.nodes.find((n) => n.id === 'server/identity')!.status).toBe('added')
    expect(d.summary.addedNodes).toBeGreaterThanOrEqual(1)
  })

  it('reports no changes when diffing the live graph against itself', () => {
    const g = loadL0Graph(openCodegraphDb(LIFLY))
    const d = diffGraphs(g, g, 'module', null, mod, 'base', 'head')
    expect(d.summary).toEqual({ addedNodes: 0, removedNodes: 0, changedNodes: 0, addedEdges: 0, removedEdges: 0 })
  })
})
```

- [ ] **Step 2: 跑集成测试.** Run: `cd /home/hills/projects/archub && pnpm test lifly-diff`. Expected: PASS（2 passed，真实运行）。

- [ ] **Step 3: 提交**

```bash
cd /home/hills/projects/archub
git add tests/integration/lifly-diff.test.ts
git commit -m "test(diff): integration diff over real lifly graph (synthetic base)"
```

---

# PART B —— 前端：对比模式

## Task 9: 前端 diff 类型 + API client

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/client.ts`
- Test: `web/tests/diffClient.test.ts`

- [ ] **Step 1: 在 `web/src/api/types.ts` 末尾追加 diff 类型**（与后端 `src/diff/types.ts` 逐字一致）

```ts
export type NodeDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'
export type EdgeDiffStatus = 'added' | 'removed' | 'unchanged'
export interface DiffNode extends GraphNodeDTO { status: NodeDiffStatus }
export interface DiffEdge extends GraphEdgeDTO { status: EdgeDiffStatus }
export interface DiffSummary { addedNodes: number; removedNodes: number; changedNodes: number; addedEdges: number; removedEdges: number }
export interface GraphDiff { level: Level; scope: string | null; base: string; head: string; nodes: DiffNode[]; edges: DiffEdge[]; summary: DiffSummary }
export interface CommitInfo { sha: string; message: string; date: string }
export interface RefInfo { currentSha: string; branches: string[]; commits: CommitInfo[]; snapshots: string[] }
```

- [ ] **Step 2: 写失败测试 `web/tests/diffClient.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchRefs, fetchDiff } from '../src/api/client'

afterEach(() => vi.restoreAllMocks())
function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }))
}

describe('diff api client', () => {
  it('fetchRefs hits /api/refs', async () => {
    mockFetch({ currentSha: 'x', branches: [], commits: [], snapshots: [] })
    await fetchRefs()
    expect(fetch).toHaveBeenCalledWith('/api/refs')
  })
  it('fetchDiff builds module-level query', async () => {
    mockFetch({ level: 'module', scope: null, base: 'b', head: 'h', nodes: [], edges: [], summary: {} })
    await fetchDiff('abc', 'WORKING', 'module', null)
    expect(fetch).toHaveBeenCalledWith('/api/diff?base=abc&head=WORKING&level=module')
  })
  it('fetchDiff adds module scope at file level', async () => {
    mockFetch({})
    await fetchDiff('abc', 'WORKING', 'file', 'server/identity')
    expect(fetch).toHaveBeenCalledWith('/api/diff?base=abc&head=WORKING&level=file&module=server%2Fidentity')
  })
  it('fetchDiff adds file scope at function level', async () => {
    mockFetch({})
    await fetchDiff('abc', 'WORKING', 'function', 'server/src/identity/service.rs')
    expect(fetch).toHaveBeenCalledWith('/api/diff?base=abc&head=WORKING&level=function&file=server%2Fsrc%2Fidentity%2Fservice.rs')
  })
})
```

- [ ] **Step 3: 跑测试确认失败.** Run: `cd /home/hills/projects/archub/web && pnpm test diffClient`. Expected: FAIL。

- [ ] **Step 4: 在 `web/src/api/client.ts` 追加**

```ts
import type { GraphResponse, Level, NodeDetail, SearchHit, RefInfo, GraphDiff } from './types'
// (把上面这行替换原有的 import，新增 RefInfo, GraphDiff)

export function fetchRefs(): Promise<RefInfo> {
  return getJson('/api/refs')
}

export function fetchDiff(base: string, head: string, level: Level, scope: string | null): Promise<GraphDiff> {
  const params = new URLSearchParams({ base, head, level })
  if (level === 'file' && scope) params.set('module', scope)
  if (level === 'function' && scope) params.set('file', scope)
  return getJson(`/api/diff?${params.toString()}`)
}
```
> 注：`URLSearchParams` 的 `toString()` 会按插入顺序编码（base、head、level、然后 module/file），且对 `/` 编码为 `%2F`、空格为 `+`。本任务测试里的断言 URL 即按此顺序。确认 `getJson` 已在 M2 的 client.ts 中定义（私有 helper）。

- [ ] **Step 5: 跑测试确认通过.** Run: `cd /home/hills/projects/archub/web && pnpm test diffClient`. Expected: PASS（4 passed）。

- [ ] **Step 6: 提交**

```bash
cd /home/hills/projects/archub
git add web/src/api/types.ts web/src/api/client.ts web/tests/diffClient.test.ts
git commit -m "feat(web): diff API types + fetchRefs/fetchDiff client"
```

---

## Task 10: diff 并集图布局（按 status 着色）

**Files:**
- Create: `web/src/graph/diffLayout.ts`
- Test: `web/tests/diffLayout.test.ts`

复用 dagre 布局，但输入是 `GraphDiff` 的并集 nodes/edges，节点/边按 status 着色（绿=added、红=removed、黄=changed、灰=unchanged；removed 边虚线）。

- [ ] **Step 1: 写失败测试 `web/tests/diffLayout.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { layoutDiff, STATUS_COLOR } from '../src/graph/diffLayout'
import type { GraphDiff } from '../src/api/types'

const d: GraphDiff = {
  level: 'module', scope: null, base: 'b', head: 'h',
  nodes: [
    { id: 'a', label: 'a', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'added' },
    { id: 'b', label: 'b', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'removed' },
    { id: 'c', label: 'c', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'changed' },
  ],
  edges: [
    { source: 'a', target: 'c', weight: 1, status: 'added' },
    { source: 'b', target: 'c', weight: 1, status: 'removed' },
  ],
  summary: { addedNodes: 1, removedNodes: 1, changedNodes: 1, addedEdges: 1, removedEdges: 1 },
}

describe('layoutDiff', () => {
  it('positions every node and colors by status', () => {
    const { nodes } = layoutDiff(d)
    expect(nodes).toHaveLength(3)
    expect(nodes.every((n) => typeof n.position.x === 'number')).toBe(true)
    const added = nodes.find((n) => n.id === 'a')!
    expect(added.data.status).toBe('added')
    expect(added.data.color).toBe(STATUS_COLOR.added)
    expect(added.type).toBe('diffNode')
  })
  it('styles removed edges dashed and colors edges by status', () => {
    const { edges } = layoutDiff(d)
    const removed = edges.find((e) => e.id === 'b->c')!
    expect(removed.style?.strokeDasharray).toBeTruthy()
    expect(removed.style?.stroke).toBe(STATUS_COLOR.removed)
    const added = edges.find((e) => e.id === 'a->c')!
    expect(added.style?.stroke).toBe(STATUS_COLOR.added)
  })
})
```

- [ ] **Step 2: 跑测试确认失败.** Run: `cd /home/hills/projects/archub/web && pnpm test diffLayout`. Expected: FAIL。

- [ ] **Step 3: 实现 `web/src/graph/diffLayout.ts`**

```ts
import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { GraphDiff, NodeDiffStatus, EdgeDiffStatus } from '../api/types'

export const STATUS_COLOR: Record<NodeDiffStatus, string> = {
  added: '#16a34a',     // green
  removed: '#dc2626',   // red
  changed: '#ca8a04',   // yellow
  unchanged: '#9ca3af', // gray
}

export type DiffNodeData = { label: string; status: NodeDiffStatus; color: string; childCount: number } & Record<string, unknown>
export type DiffFlowNode = Node<DiffNodeData>

const NODE_W = 180
const NODE_H = 48

export function layoutDiff(d: GraphDiff): { nodes: Node<DiffNodeData>[]; edges: Edge[] } {
  const dg = new dagre.graphlib.Graph()
  dg.setDefaultEdgeLabel(() => ({}))
  dg.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 })
  for (const n of d.nodes) dg.setNode(n.id, { width: NODE_W, height: NODE_H })
  for (const e of d.edges) dg.setEdge(e.source, e.target)
  dagre.layout(dg)

  const nodes: Node<DiffNodeData>[] = d.nodes.map((n) => {
    const p = dg.node(n.id)
    return {
      id: n.id,
      type: 'diffNode',
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: { label: n.label, status: n.status, color: STATUS_COLOR[n.status], childCount: n.childCount },
    }
  })

  const edgeColor: Record<EdgeDiffStatus, string> = { added: STATUS_COLOR.added, removed: STATUS_COLOR.removed, unchanged: STATUS_COLOR.unchanged }
  const edges: Edge[] = d.edges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    style: {
      stroke: edgeColor[e.status],
      strokeWidth: Math.min(1 + Math.log2(e.weight + 1), 6),
      strokeDasharray: e.status === 'removed' ? '6 4' : undefined,
    },
  }))

  return { nodes, edges }
}
```

- [ ] **Step 4: 跑测试确认通过.** Run: `cd /home/hills/projects/archub/web && pnpm test diffLayout`. Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add web/src/graph/diffLayout.ts web/tests/diffLayout.test.ts
git commit -m "feat(web): diff union-graph layout with status colors"
```

---

## Task 11: diff 节点组件 + diff 报告面板

**Files:**
- Create: `web/src/graph/DiffNode.tsx`
- Create: `web/src/compare/DiffReport.tsx`

- [ ] **Step 1: 实现 `web/src/graph/DiffNode.tsx`**

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { DiffFlowNode } from './diffLayout'

export function DiffNode({ data }: NodeProps<DiffFlowNode>) {
  return (
    <div
      data-testid="diff-node"
      data-status={data.status}
      style={{
        padding: '8px 12px', borderRadius: 8,
        border: `2px solid ${data.color}`, background: '#fff', minWidth: 140,
        opacity: data.status === 'removed' ? 0.6 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600, fontSize: 13 }}>{data.label}</div>
      <div style={{ fontSize: 11, color: data.color }}>{data.status}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const diffNodeTypes = { diffNode: DiffNode }
```

- [ ] **Step 2: 实现 `web/src/compare/DiffReport.tsx`**（分组文字报告 + 导出 Markdown）

```tsx
import type { GraphDiff } from '../api/types'

function md(d: GraphDiff): string {
  const lines = [`# Architecture diff: ${d.base} → ${d.head} (${d.level} level)`, '']
  const s = d.summary
  if (s.addedNodes + s.removedNodes + s.changedNodes + s.addedEdges + s.removedEdges === 0) return '# No architecture changes.'
  lines.push(`**Summary:** +${s.addedNodes} / -${s.removedNodes} nodes, ~${s.changedNodes} changed; +${s.addedEdges} / -${s.removedEdges} edges.`, '')
  const sec = (t: string, items: string[]) => { if (items.length) { lines.push(`## ${t}`); items.forEach((i) => lines.push(`- ${i}`)); lines.push('') } }
  sec('Added', d.nodes.filter((n) => n.status === 'added').map((n) => `+ ${n.label}`))
  sec('Removed', d.nodes.filter((n) => n.status === 'removed').map((n) => `- ${n.label}`))
  sec('Changed', d.nodes.filter((n) => n.status === 'changed').map((n) => `~ ${n.label} (dependencies changed)`))
  sec('Added edges', d.edges.filter((e) => e.status === 'added').map((e) => `+ ${e.source} → ${e.target}`))
  sec('Removed edges', d.edges.filter((e) => e.status === 'removed').map((e) => `- ${e.source} → ${e.target}`))
  return lines.join('\n')
}

export function DiffReport({ diff }: { diff: GraphDiff }) {
  const group = (status: string) => diff.nodes.filter((n) => n.status === status)
  const addedE = diff.edges.filter((e) => e.status === 'added')
  const removedE = diff.edges.filter((e) => e.status === 'removed')
  const copy = () => navigator.clipboard?.writeText(md(diff))
  return (
    <aside data-testid="diff-report" style={{ width: 340, borderLeft: '1px solid #ddd', padding: 12, fontSize: 13, overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>{diff.base} → {diff.head}</b>
        <button data-testid="copy-md" onClick={copy}>复制 Markdown</button>
      </div>
      <p style={{ color: '#555' }}>
        +{diff.summary.addedNodes} / -{diff.summary.removedNodes} 节点, ~{diff.summary.changedNodes} 变化; +{diff.summary.addedEdges} / -{diff.summary.removedEdges} 边
      </p>
      <Group title="新增" color="#16a34a" items={group('added').map((n) => n.label)} />
      <Group title="删除" color="#dc2626" items={group('removed').map((n) => n.label)} />
      <Group title="变化" color="#ca8a04" items={group('changed').map((n) => n.label)} />
      <Group title="新增边" color="#16a34a" items={addedE.map((e) => `${e.source} → ${e.target}`)} />
      <Group title="删除边" color="#dc2626" items={removedE.map((e) => `${e.source} → ${e.target}`)} />
    </aside>
  )
}

function Group({ title, color, items }: { title: string; color: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 600, color }}>{title} ({items.length})</div>
      <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: 类型检查.** Run: `cd /home/hills/projects/archub/web && pnpm exec tsc -b --noEmit`. Expected: 无错误。（若 React Flow 类型对 `NodeProps<DiffFlowNode>` 报错，按 M2 经验确认 `DiffFlowNode = Node<DiffNodeData>`。`navigator.clipboard` 在 DOM lib 下可用。）

- [ ] **Step 4: 提交**

```bash
cd /home/hills/projects/archub
git add web/src/graph/DiffNode.tsx web/src/compare/DiffReport.tsx
git commit -m "feat(web): diff node component + grouped diff report panel with markdown export"
```

---

## Task 12: 对比模式视图 + 模式切换

**Files:**
- Create: `web/src/compare/RefSelector.tsx`
- Create: `web/src/compare/CompareView.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/tests/CompareView.test.tsx`

- [ ] **Step 1: 实现 `web/src/compare/RefSelector.tsx`**

```tsx
import type { RefInfo } from '../api/types'

export function RefSelector({ label, value, onChange, refs, testid }: { label: string; value: string; onChange: (v: string) => void; refs: RefInfo; testid: string }) {
  return (
    <label style={{ fontSize: 13, marginRight: 12 }}>
      {label}{' '}
      <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="WORKING">当前工作区</option>
        <optgroup label="分支">
          {refs.branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </optgroup>
        <optgroup label="快照 commit">
          {refs.commits.filter((c) => refs.snapshots.includes(c.sha)).map((c) => (
            <option key={c.sha} value={c.sha}>{c.sha.slice(0, 8)} {c.message.slice(0, 40)}</option>
          ))}
        </optgroup>
      </select>
    </label>
  )
}
```

- [ ] **Step 2: 实现 `web/src/compare/CompareView.tsx`**

```tsx
import { ReactFlow, Background, Controls, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useState } from 'react'
import { fetchRefs, fetchDiff } from '../api/client'
import type { GraphDiff, RefInfo } from '../api/types'
import { layoutDiff, type DiffNodeData } from '../graph/diffLayout'
import { diffNodeTypes } from '../graph/DiffNode'
import { RefSelector } from './RefSelector'
import { DiffReport } from './DiffReport'
import { Breadcrumb, type Crumb } from '../explore/Breadcrumb'

const ROOT: Crumb = { label: '全部模块', level: 'module', scope: null }

export function CompareView() {
  const [refs, setRefs] = useState<RefInfo | null>(null)
  const [base, setBase] = useState('')
  const [head, setHead] = useState('WORKING')
  const [crumbs, setCrumbs] = useState<Crumb[]>([ROOT]) // 对比模式下钻栈 (spec 5.6)
  const [diff, setDiff] = useState<GraphDiff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const top = crumbs[crumbs.length - 1]

  useEffect(() => {
    fetchRefs().then((r) => {
      setRefs(r)
      // 默认 base = 最近一个有快照的 commit
      const firstSnap = r.commits.find((c) => r.snapshots.includes(c.sha))
      if (firstSnap) setBase(firstSnap.sha)
    })
  }, [])

  // 切换 base/head 时回到模块级根
  useEffect(() => { setCrumbs([ROOT]) }, [base, head])

  useEffect(() => {
    if (!base) return
    let live = true
    setError(null)
    fetchDiff(base, head, top.level, top.scope)
      .then((d) => { if (live) setDiff(d) })
      .catch((e) => { if (live) { setDiff(null); setError(String(e.message ?? e)) } })
    return () => { live = false }
  }, [base, head, top.level, top.scope])

  if (!refs) return <div style={{ padding: 16 }}>加载 refs…</div>
  const layout = diff ? layoutDiff(diff) : null

  // 对比模式下钻：模块→文件→函数（在钻入层级重算 diff）
  function drill(node: { id: string; label: string }) {
    if (top.level === 'module') setCrumbs((c) => [...c, { label: node.label, level: 'file', scope: node.id }])
    else if (top.level === 'file') setCrumbs((c) => [...c, { label: node.label, level: 'function', scope: node.id }])
    // function 级不再下钻
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header data-testid="compare-controls" style={{ padding: 8, borderBottom: '1px solid #ddd' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RefSelector label="base" value={base} onChange={setBase} refs={refs} testid="base-select" />
          <RefSelector label="head" value={head} onChange={setHead} refs={refs} testid="head-select" />
        </div>
        <Breadcrumb crumbs={crumbs} onJump={(i) => setCrumbs((c) => c.slice(0, i + 1))} />
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          {error && <div data-testid="diff-error" style={{ padding: 16, color: '#b91c1c' }}>{error}</div>}
          {!error && layout && (
            <ReactFlow
              nodes={layout.nodes}
              edges={layout.edges}
              nodeTypes={diffNodeTypes}
              fitView
              onNodeClick={(_e, n: Node<DiffNodeData>) => drill({ id: n.id, label: n.data.label })}
            >
              <Background /><Controls />
            </ReactFlow>
          )}
          {!error && !layout && base && <div style={{ padding: 16 }}>计算 diff…</div>}
          {!base && <div style={{ padding: 16 }}>暂无可用快照作为 base。先运行 <code>archub snapshot</code>。</div>}
        </div>
        {diff && <DiffReport diff={diff} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 改 `web/src/App.tsx` 加 explore/compare 模式切换**

```tsx
import { useState } from 'react'
import { ExploreView } from './explore/ExploreView'
import { CompareView } from './compare/CompareView'

export function App() {
  const [mode, setMode] = useState<'explore' | 'compare'>('explore')
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 6, borderBottom: '1px solid #eee', display: 'flex', gap: 8 }}>
        <button data-testid="mode-explore" onClick={() => setMode('explore')} style={{ fontWeight: mode === 'explore' ? 700 : 400 }}>探索</button>
        <button data-testid="mode-compare" onClick={() => setMode('compare')} style={{ fontWeight: mode === 'compare' ? 700 : 400 }}>对比</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'explore' ? <ExploreView /> : <CompareView />}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 写组件测试 `web/tests/CompareView.test.tsx`**（mock ReactFlow + api client）

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: unknown }) => <div data-testid="rf">{children as never}</div>,
  Background: () => null, Controls: () => null,
  Handle: () => null, Position: { Top: 'top', Bottom: 'bottom' },
}))

const calls: Array<[string, string]> = []
vi.mock('../src/api/client', () => ({
  fetchRefs: vi.fn(() => Promise.resolve({ currentSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', branches: ['main'], commits: [{ sha: 'b'.repeat(40), message: 'base commit', date: '' }], snapshots: ['b'.repeat(40)] })),
  fetchDiff: vi.fn((base: string, head: string) => {
    calls.push([base, head])
    return Promise.resolve({ level: 'module', scope: null, base, head, nodes: [{ id: 'server/common', label: 'server/common', level: 'module', kind: 'module', language: 'rust', childCount: 1, filePath: null, status: 'added' }], edges: [], summary: { addedNodes: 1, removedNodes: 0, changedNodes: 0, addedEdges: 0, removedEdges: 0 } })
  }),
}))

import { CompareView } from '../src/compare/CompareView'

beforeEach(() => { calls.length = 0 })

describe('CompareView', () => {
  it('loads refs, picks a snapshot base, fetches diff, shows the report', async () => {
    render(<CompareView />)
    await waitFor(() => expect(screen.getByTestId('diff-report')).toBeInTheDocument())
    // base defaulted to the snapshot commit; head defaults WORKING
    expect(calls.some(([b, h]) => b === 'b'.repeat(40) && h === 'WORKING')).toBe(true)
    // report shows the added module
    expect(within(screen.getByTestId('diff-report')).getByText('server/common')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: 跑测试 + 类型检查 + 全量前端测试.** Run:
```bash
cd /home/hills/projects/archub/web && pnpm test CompareView && pnpm exec tsc -b --noEmit && pnpm test
```
Expected: CompareView 1 passed；tsc 无错误；全部前端测试通过（client + layout + ExploreView + diffClient + diffLayout + CompareView）。

- [ ] **Step 6: 构建.** Run: `cd /home/hills/projects/archub/web && pnpm build`. Expected: `web/dist/` 产出，无错误。

- [ ] **Step 7: 提交**

```bash
cd /home/hills/projects/archub
git add web/src/compare web/src/App.tsx web/tests/CompareView.test.tsx
git commit -m "feat(web): compare mode — ref selectors, diff canvas, report; explore/compare toggle"
```

---

## Task 13: 对比模式 E2E（Playwright，真实后端 + lifly + 真实快照）

**Files:**
- Modify: `web/playwright.config.ts`（加第二个 spec 自动被 testDir 收纳，无需改 config；但需在 webServer 启动前为 lifly 建快照）
- Create: `web/e2e/compare.spec.ts`

E2E 前置：lifly 需要至少一个快照。用 `globalSetup` 在跑测试前执行 `archub snapshot`。

- [ ] **Step 1: 写 `web/e2e/global-setup.ts`**（建一个 lifly 快照，供对比模式有 base 可选）

```ts
import { execFileSync } from 'node:child_process'
export default function globalSetup() {
  // 为 lifly 建当前快照，使对比模式有 base 可选（向前快照）
  execFileSync('node', ['../dist/cli.js', 'snapshot', '--project', '/home/hills/projects/lifly'], { stdio: 'inherit' })
}
```

- [ ] **Step 2: 在 `web/playwright.config.ts` 注册 globalSetup**（其余不变）

在 `defineConfig({...})` 里加一行 `globalSetup: './e2e/global-setup.ts',`（与 `testDir`、`use`、`webServer` 并列）。

- [ ] **Step 3: 写 `web/e2e/compare.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('compare mode: switch to compare, diff a snapshot vs working tree, see the report', async ({ page }) => {
  await page.goto('/')
  // 切到对比模式
  await page.getByTestId('mode-compare').click()
  await expect(page.getByTestId('compare-controls')).toBeVisible({ timeout: 15000 })
  // base/head 选择器出现；head 默认当前工作区
  await expect(page.getByTestId('base-select')).toBeVisible()
  await expect(page.getByTestId('head-select')).toBeVisible()
  // 报告面板出现（base=刚建的快照, head=WORKING；同源 → 无变化）
  await expect(page.getByTestId('diff-report')).toBeVisible({ timeout: 15000 })
  // base 与 head 同源（刚 snapshot 的 HEAD vs 工作区，无改动）→ 报告显示无变化的汇总(0/0)
  await expect(page.getByTestId('diff-report')).toContainText('+0 / -0 节点')
})
```
> 说明：因 lifly 工作区与刚建快照的 HEAD 同源，diff 为空——E2E 断言"对比模式可加载并算出 diff"（控件 + 报告 + 0/0 汇总）。这验证了端到端链路（refs → diff → 渲染），而非需要人为制造差异。

- [ ] **Step 4: 跑 E2E.** Run:
```bash
cd /home/hills/projects/archub && pnpm build
cd web && pnpm e2e
```
Expected: 两个 spec 都通过（explore.spec 1 + compare.spec 1 = 2 passed）。
> 若 `mode-compare` 点击后控件未出现，检查 App.tsx 模式切换；若 diff-report 不出现，可能是 lifly 无快照（确认 globalSetup 跑了 `archub snapshot`，且 `/home/hills/projects/lifly/.archub/snapshots/` 有文件）。可手动 `node dist/cli.js snapshot --project /home/hills/projects/lifly` 后重试。若汇总文案不是 `+0 / -0 节点`（例如工作区与 HEAD 不同源），把断言改为匹配实际真实汇总——但保持断言在真实值上。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add web/playwright.config.ts web/e2e/global-setup.ts web/e2e/compare.spec.ts
git commit -m "test(web): Playwright E2E for compare mode against real lifly + snapshot"
```

---

# PART C —— 收尾

## Task 14: M3 收尾（全量测试 + 文档 + 推送）

**Files:**
- Modify: `README.md`
- Modify: `docs/codegraph-schema.md`（可选）

- [ ] **Step 1: 后端全量测试.** Run: `cd /home/hills/projects/archub && pnpm test`. Expected: 全绿（M2 的 ~38 + M3 新增：repo 3 + store 4 + diff/engine 3 + report 2 + diff/service 2 + diff-api 4 + lifly-diff 2 ≈ +20）。以实际为准，全部 PASS。

- [ ] **Step 2: 前端全量测试.** Run: `cd /home/hills/projects/archub/web && pnpm test`. Expected: 全绿（M2 的 7 + M3 新增：diffClient 4 + diffLayout 2 + CompareView 1 = 14）。

- [ ] **Step 3: 端到端构建 + 快照 + diff + serve 验证.** Run:
```bash
cd /home/hills/projects/archub && pnpm build && cd web && pnpm build && cd ..
node dist/cli.js snapshot --project /home/hills/projects/lifly
node dist/cli.js diff --project /home/hills/projects/lifly --base HEAD --head WORKING --md
node dist/cli.js serve --project /home/hills/projects/lifly --port 4324 &
sleep 1.5
curl -s 'http://localhost:4324/api/refs' | head -c 200; echo
curl -s 'http://localhost:4324/api/diff?base=HEAD&head=WORKING&level=module' | head -c 200; echo
kill %1 2>/dev/null
```
Expected: snapshot 成功；`diff --md` 打印 `No architecture changes.`（同源）；`/api/refs` 返回 JSON（含 snapshots 数组）；`/api/diff` 返回 GraphDiff JSON。

- [ ] **Step 4: 更新 `README.md`**：状态改为 "M3（按 commit 架构 diff）已完成"；补 `archub snapshot` / `archub install-hook` / `archub diff [--md]` 用法 + 对比模式说明（前端顶部"对比"标签，选 base/head，看着色并集图 + 可导出 Markdown 的报告）。说明"向前快照"语义（只能 diff 已存档 SHA 或当前工作区）。不要描述未做的 M4 实时刷新。

- [ ] **Step 5: 提交并推送**

```bash
cd /home/hills/projects/archub
git add README.md docs/codegraph-schema.md
git commit -m "docs: M3 complete — snapshots + git + diff engine + compare-mode web UI"
git push
```
Expected: 推送成功，`origin/main` 更新。

---

## M3 完成判据（Definition of Done）

- 后端 `pnpm test` 全绿，含 git/snapshot/diff 单测 + `lifly-diff` 集成测试。
- 前端 `web/ pnpm test` 全绿；`web/ pnpm e2e` 的 explore + compare 两个 E2E 通过。
- `archub snapshot` 在目标项目 `.archub/snapshots/` 写出按 SHA 的 gzip 快照；`archub install-hook` 装 post-commit hook；`archub diff --md` 输出 Markdown 报告。
- `archub serve` 的对比模式可用：选 base/head → 着色并集图 + 分组报告 + 导出 Markdown。
- 所有改动已提交并推送。

**M3 完成后**：进入 M4（DB 文件变化检测 + SSE/WS 实时刷新 + 打磨）。
