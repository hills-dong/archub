# archub M1: 地基 + codegraph 验证与 Schema 探明 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭好 archub 的 Node/TypeScript 工程地基，并验证 codegraph 在 lifly 上可用（Rust 抽取质量 go/no-go）、探明并文档化其 SQLite 真实表结构，为后续里程碑提供精确依据。

**Architecture:** archub 把 codegraph 当索引器，只读其 `.codegraph/codegraph.db`。本里程碑产出一个 schema-无关的 introspection CLI（`archub probe`），用它对 lifly 真实 DB 探明 nodes/edges 表结构并写成文档；同时通过对 lifly 实跑 codegraph，验证 Rust 抽取质量这一 go/no-go 关卡。

**Tech Stack:** Node ≥20 + TypeScript (ESM, NodeNext) · pnpm · vitest · commander · better-sqlite3

> **里程碑路线图（本计划只覆盖 M1）**
> - **M1（本计划）**：地基 + 验证 + schema 探明。
> - M2：schema 适配器 + L0 图模型 + L0→L1→L2 聚合 + REST API + 探索模式 Web UI。
> - M3：向前快照 + git 集成 + diff 引擎 + 对比模式 UI（图高亮 + Markdown 报告）。
> - M4：DB 变化检测 + SSE/WS 实时刷新 + 打磨。
> M2 起的详细代码依赖 M1 探明的真实 schema，故在 M1 完成后再撰写。设计全文见 `docs/specs/2026-05-29-archub-design.md`。

---

## File Structure（M1 涉及的文件）

```
archub/
  package.json            # 工程清单 + bin: archub
  tsconfig.json           # TS 编译配置 (ESM/NodeNext)
  vitest.config.ts        # 测试配置
  src/
    cli.ts                # commander 入口, 注册 version + probe 子命令
    version.ts            # 读 package.json 版本号
    db/
      connect.ts          # 只读打开 codegraph SQLite, 缺失时清晰报错
      introspect.ts       # schema-无关: 列出表/列/行数 (读 sqlite_master)
      probe.ts            # 组合 connect+introspect, 提供格式化输出
  tests/
    version.test.ts
    db/
      connect.test.ts
      introspect.test.ts
      probe.test.ts
    integration/
      lifly-probe.test.ts # 对 lifly 真实 DB 跑 (DB 不存在则 skip)
  docs/
    verification-notes.md # Task 2 产出: 安装/统计/Rust go-no-go 结论
    codegraph-schema.md   # Task 6 产出: 真实表结构 + M2 适配器输入
```

每个文件单一职责：`connect` 只管打开连接，`introspect` 只管 schema 反射，`probe` 只做组合与展示，`cli` 只做命令注册。

---

## Task 1: 工程地基与工具链冒烟测试

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/version.ts`
- Create: `src/cli.ts`
- Test: `tests/version.test.ts`

- [ ] **Step 1: 写 `package.json`**（不写死依赖版本，下一步用 `pnpm add` 拉真实最新版，避免编造不存在的版本号）

```json
{
  "name": "archub",
  "version": "0.1.0",
  "description": "Real-time code architecture visualization + per-commit architecture diff review",
  "type": "module",
  "bin": { "archub": "./dist/cli.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 2: 安装依赖（拉真实版本）**

Run:
```bash
cd /home/hills/projects/archub
pnpm add better-sqlite3 commander
pnpm add -D typescript tsx vitest @types/node @types/better-sqlite3
```
Expected: `pnpm-lock.yaml` 生成，`node_modules` 安装成功，无报错。

- [ ] **Step 3: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 写 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: 写失败测试 `tests/version.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { getVersion } from '../src/version.js'

describe('getVersion', () => {
  it('returns the package version', () => {
    expect(getVersion()).toBe('0.1.0')
  })
})
```

- [ ] **Step 6: 跑测试确认失败**

Run: `cd /home/hills/projects/archub && pnpm test`
Expected: FAIL —— 无法解析 `../src/version.js`（模块不存在）。

- [ ] **Step 7: 实现 `src/version.ts`**

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export function getVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))
  return pkg.version as string
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `cd /home/hills/projects/archub && pnpm test`
Expected: PASS（1 passed）。

- [ ] **Step 9: 写 CLI 入口 `src/cli.ts`（本任务只接 version）**

```ts
#!/usr/bin/env node
import { Command } from 'commander'
import { getVersion } from './version.js'

const program = new Command()
program
  .name('archub')
  .description('Real-time code architecture visualization + diff review')
  .version(getVersion())

program.parseAsync(process.argv)
```

- [ ] **Step 10: 构建并冒烟验证 CLI**

Run:
```bash
cd /home/hills/projects/archub && pnpm build && node dist/cli.js --version
```
Expected: 打印 `0.1.0`。

- [ ] **Step 11: 提交**

```bash
cd /home/hills/projects/archub
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts src/version.ts src/cli.ts tests/version.test.ts
git commit -m "chore: scaffold Node/TS project with vitest and CLI skeleton"
```

---

## Task 2: codegraph 验证 Spike（go/no-go 关卡，调查型，非 TDD）

> 本任务是调查/验证，不写产品代码，故不走 TDD。产出是一份事实文档 + 明确的 GO/NO-GO 结论。

**Files:**
- Create: `docs/verification-notes.md`

- [ ] **Step 1: 安装 codegraph 并确认版本**

Run:
```bash
npm install -g @colbymchenry/codegraph
codegraph --version
```
Expected: 打印出某个版本号。记录该版本号（后续 M 锁定它）。

- [ ] **Step 2: 查看 init 的真实参数（不臆测 flag）**

Run: `codegraph init --help`
记录可用子命令/flag（确认 `-i` 含义；若有非交互模式优先用之）。

- [ ] **Step 3: 对 lifly 实跑索引**

Run:
```bash
cd /home/hills/projects/lifly
codegraph init -i      # 若 --help 显示有非交互 flag, 改用之
codegraph status
```
Expected: `.codegraph/codegraph.db` 生成；`status` 打印节点/边/文件统计。记录总数。

- [ ] **Step 4: 验证 Rust 抽取质量（核心关卡）**

依次执行并记录输出（用 lifly 真实存在的 Rust 符号，例如 `identity` 模块的登录相关函数；先用 query 找到真实符号名再查其 callers/callees）：
```bash
cd /home/hills/projects/lifly
codegraph query login --json          # 找一个真实 Rust 函数节点
codegraph callers <上一步得到的符号> --json
codegraph callees <上一步得到的符号> --json
codegraph files server/src --json     # 确认 server/ 下 Rust 文件被索引
```
对前端同样抽查一个 `web/src` 下的 TS 符号，记录 server/(Rust) 与 web/(TS) 各自的节点/边规模。

- [ ] **Step 5: 写 `docs/verification-notes.md`**

至少包含：
- codegraph 版本号、安装方式
- 全库总 节点数 / 边数 / 文件数
- Rust：server/ 下节点数；一个真实 Rust 函数样例及其 callers/callees 实测结果（贴 JSON 片段）
- TS：web/ 下节点数；一个样例符号
- **GO/NO-GO 结论**，判定标准明确写出：
  - ✅ GO 条件：Rust 函数/方法被索引为节点（server/ 节点数 > 0 且覆盖主要模块）**且** Rust 函数间存在调用边（callees/callers 非空）。
  - ❌ NO-GO：Rust 几乎无节点或无调用边 → 立即上报，M2 起需重新评估（如补充其它 Rust 解析方案），**不得**在 Rust 数据缺失的情况下继续后续里程碑。

- [ ] **Step 6: 提交**

```bash
cd /home/hills/projects/archub
git add docs/verification-notes.md
git commit -m "docs: codegraph verification notes on lifly (Rust go/no-go)"
```

> ⚠️ **门禁**：若本任务结论为 NO-GO，暂停后续 Task，向用户汇报。

---

## Task 3: SQLite 只读连接模块

**Files:**
- Create: `src/db/connect.ts`
- Test: `tests/db/connect.test.ts`

- [ ] **Step 1: 写失败测试 `tests/db/connect.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { openCodegraphDb, codegraphDbPath } from '../../src/db/connect.js'

let tmp = ''
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = ''
})

describe('openCodegraphDb', () => {
  it('opens an existing codegraph db read-only', () => {
    tmp = mkdtempSync(join(tmpdir(), 'archub-'))
    mkdirSync(join(tmp, '.codegraph'))
    new Database(codegraphDbPath(tmp)).close() // 先创建该文件
    const db = openCodegraphDb(tmp)
    expect(db.open).toBe(true)
    db.close()
  })

  it('throws a clear error when the db is missing', () => {
    tmp = mkdtempSync(join(tmpdir(), 'archub-'))
    expect(() => openCodegraphDb(tmp)).toThrow(/No codegraph database/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/hills/projects/archub && pnpm test connect`
Expected: FAIL —— 无法解析 `../../src/db/connect.js`。

- [ ] **Step 3: 实现 `src/db/connect.ts`**

```ts
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function codegraphDbPath(projectRoot: string): string {
  return join(resolve(projectRoot), '.codegraph', 'codegraph.db')
}

export function openCodegraphDb(projectRoot: string): Database.Database {
  const path = codegraphDbPath(projectRoot)
  if (!existsSync(path)) {
    throw new Error(
      `No codegraph database at ${path}. Run \`codegraph init -i\` in ${projectRoot} first.`,
    )
  }
  // 只读打开: codegraph 的 watcher 可能正持有写连接
  return new Database(path, { readonly: true, fileMustExist: true })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /home/hills/projects/archub && pnpm test connect`
Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/db/connect.ts tests/db/connect.test.ts
git commit -m "feat: read-only codegraph sqlite connection with clear missing-db error"
```

---

## Task 4: Schema 反射模块（schema-无关，现在即可写）

> 通过 `sqlite_master` + `PRAGMA table_info` 反射，**不依赖** codegraph 具体表结构，因此现在就能完整实现。

**Files:**
- Create: `src/db/introspect.ts`
- Test: `tests/db/introspect.test.ts`

- [ ] **Step 1: 写失败测试 `tests/db/introspect.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { introspectSchema } from '../../src/db/introspect.js'

describe('introspectSchema', () => {
  it('reports tables, their columns, and row counts', () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE nodes (id INTEGER PRIMARY KEY, name TEXT, file TEXT);`)
    db.exec(`CREATE TABLE edges (src INTEGER, dst INTEGER, kind TEXT);`)
    db.prepare(`INSERT INTO nodes (name, file) VALUES (?, ?)`).run('login', 'a.rs')
    db.prepare(`INSERT INTO nodes (name, file) VALUES (?, ?)`).run('logout', 'a.rs')

    const schema = introspectSchema(db)

    const nodes = schema.find((t) => t.name === 'nodes')
    expect(nodes).toBeDefined()
    expect(nodes!.rowCount).toBe(2)
    expect(nodes!.columns.map((c) => c.name)).toEqual(['id', 'name', 'file'])

    const edges = schema.find((t) => t.name === 'edges')
    expect(edges!.rowCount).toBe(0)
    db.close()
  })

  it('skips internal sqlite_ tables', () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE t (x INTEGER);`)
    const names = introspectSchema(db).map((t) => t.name)
    expect(names.some((n) => n.startsWith('sqlite_'))).toBe(false)
    db.close()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/hills/projects/archub && pnpm test introspect`
Expected: FAIL —— 无法解析 `../../src/db/introspect.js`。

- [ ] **Step 3: 实现 `src/db/introspect.ts`**

```ts
import type Database from 'better-sqlite3'

export interface ColumnInfo {
  name: string
  type: string
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  rowCount: number
}

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

export function introspectSchema(db: Database.Database): TableInfo[] {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[]

  return tables.map(({ name }) => {
    const columns = (
      db.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all() as {
        name: string
        type: string
      }[]
    ).map((c) => ({ name: c.name, type: c.type }))

    const { n } = db
      .prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(name)}`)
      .get() as { n: number }

    return { name, columns, rowCount: n }
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /home/hills/projects/archub && pnpm test introspect`
Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
cd /home/hills/projects/archub
git add src/db/introspect.ts tests/db/introspect.test.ts
git commit -m "feat: schema-agnostic sqlite introspection (tables/columns/row counts)"
```

---

## Task 5: `archub probe` 命令

**Files:**
- Create: `src/db/probe.ts`
- Modify: `src/cli.ts`（加 `probe` 子命令）
- Test: `tests/db/probe.test.ts`

- [ ] **Step 1: 写失败测试 `tests/db/probe.test.ts`**（测纯函数 `formatProbe` 的格式化输出）

```ts
import { describe, it, expect } from 'vitest'
import { formatProbe } from '../../src/db/probe.js'
import type { TableInfo } from '../../src/db/introspect.js'

describe('formatProbe', () => {
  it('renders each table with row count and columns', () => {
    const tables: TableInfo[] = [
      {
        name: 'nodes',
        rowCount: 2,
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'name', type: 'TEXT' },
        ],
      },
    ]
    const out = formatProbe(tables)
    expect(out).toContain('nodes (2 rows)')
    expect(out).toContain('- id: INTEGER')
    expect(out).toContain('- name: TEXT')
  })

  it('handles an empty schema', () => {
    expect(formatProbe([])).toBe('No tables found.')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/hills/projects/archub && pnpm test probe`
Expected: FAIL —— 无法解析 `../../src/db/probe.js`。

- [ ] **Step 3: 实现 `src/db/probe.ts`**

```ts
import { openCodegraphDb } from './connect.js'
import { introspectSchema, type TableInfo } from './introspect.js'

export function probe(projectRoot: string): TableInfo[] {
  const db = openCodegraphDb(projectRoot)
  try {
    return introspectSchema(db)
  } finally {
    db.close()
  }
}

export function formatProbe(tables: TableInfo[]): string {
  if (tables.length === 0) return 'No tables found.'
  return tables
    .map(
      (t) =>
        `${t.name} (${t.rowCount} rows)\n` +
        t.columns.map((c) => `  - ${c.name}: ${c.type || 'ANY'}`).join('\n'),
    )
    .join('\n\n')
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /home/hills/projects/archub && pnpm test probe`
Expected: PASS（2 passed）。

- [ ] **Step 5: 在 `src/cli.ts` 注册 `probe` 子命令**

在 `import { getVersion } ...` 行下方加：
```ts
import { probe, formatProbe } from './db/probe.js'
```
在 `program.parseAsync(process.argv)` 之前加：
```ts
program
  .command('probe')
  .description('Inspect the codegraph SQLite schema (tables, columns, row counts)')
  .option('-p, --project <path>', 'project root', process.cwd())
  .option('--json', 'output JSON', false)
  .action((opts: { project: string; json: boolean }) => {
    const tables = probe(opts.project)
    console.log(opts.json ? JSON.stringify(tables, null, 2) : formatProbe(tables))
  })
```

- [ ] **Step 6: 构建并对 lifly 真实 DB 冒烟运行**（Task 2 已生成该 DB）

Run:
```bash
cd /home/hills/projects/archub && pnpm build
node dist/cli.js probe --project /home/hills/projects/lifly
```
Expected: 打印 lifly codegraph DB 的真实表/列/行数列表（应能看到承载节点和边的表）。

- [ ] **Step 7: 提交**

```bash
cd /home/hills/projects/archub
git add src/db/probe.ts src/cli.ts tests/db/probe.test.ts
git commit -m "feat: add 'archub probe' command to inspect codegraph schema"
```

---

## Task 6: 对真实 lifly DB 的集成测试 + Schema 文档化

**Files:**
- Create: `tests/integration/lifly-probe.test.ts`
- Create: `docs/codegraph-schema.md`

- [ ] **Step 1: 写集成测试 `tests/integration/lifly-probe.test.ts`**（DB 不存在则整体 skip，存在则对真实数据断言）

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { codegraphDbPath } from '../../src/db/connect.js'
import { probe } from '../../src/db/probe.js'

const LIFLY = '/home/hills/projects/lifly'
const hasDb = existsSync(codegraphDbPath(LIFLY))

describe.skipIf(!hasDb)('codegraph schema on real lifly db', () => {
  it('exposes at least one non-empty table (the node store)', () => {
    const tables = probe(LIFLY)
    expect(tables.length).toBeGreaterThan(0)
    expect(tables.some((t) => t.rowCount > 0)).toBe(true)
  })

  it('contains a node-like table (has a name/symbol column and a file/path column)', () => {
    const tables = probe(LIFLY)
    const nodeLike = tables.find(
      (t) =>
        t.columns.some((c) => /name|symbol/i.test(c.name)) &&
        t.columns.some((c) => /file|path/i.test(c.name)),
    )
    expect(nodeLike, 'expected a node-like table with name + file columns').toBeDefined()
  })

  it('contains an edge-like table (has two reference columns)', () => {
    const tables = probe(LIFLY)
    const edgeLike = tables.find(
      (t) =>
        t.columns.filter((c) =>
          /src|source|from|target|dst|dest|to|caller|callee|ref/i.test(c.name),
        ).length >= 2,
    )
    expect(edgeLike, 'expected an edge-like table with two reference columns').toBeDefined()
  })
})
```

- [ ] **Step 2: 跑集成测试（对真实 DB）**

Run: `cd /home/hills/projects/archub && pnpm test integration`
Expected: PASS（3 passed；若 lifly DB 不存在则 skipped——但 Task 2 已生成，应实跑通过）。
> 若 node-like / edge-like 断言失败，说明真实 schema 与启发式不符——这正是要查清的点：读 Step 1 的实际列名，调整本测试的正则使其匹配真实列名（并在下一步文档里记录真实命名）。

- [ ] **Step 3: 生成真实 schema 文档 `docs/codegraph-schema.md`**

先取真实输出：
```bash
node dist/cli.js probe --project /home/hills/projects/lifly --json > /tmp/lifly-schema.json
```
据此手写 `docs/codegraph-schema.md`，至少包含：
- codegraph 版本（与 verification-notes 一致）
- 每张表：表名、列名+类型、行数（从 JSON 抄真实值）
- **标注承载"节点"的表**及其关键列：节点 id、符号名、文件路径、类型/kind、语言（如有）
- **标注承载"边"的表**及其关键列：源、目标、边类型（调用/导入）
- 列出 FTS5 虚拟表/其它辅助表（不用于建图的标注"忽略"）

- [ ] **Step 4: 提交**

```bash
cd /home/hills/projects/archub
git add tests/integration/lifly-probe.test.ts docs/codegraph-schema.md
git commit -m "test: integration probe of real lifly db + document codegraph schema"
```

---

## Task 7: M1 收尾与 M2 输入定稿

**Files:**
- Modify: `docs/codegraph-schema.md`（追加 "M2 适配器输入" 一节）

- [ ] **Step 1: 全量跑测试，确认全绿**

Run: `cd /home/hills/projects/archub && pnpm test`
Expected: 所有单元 + 集成测试 PASS（version 1 + connect 2 + introspect 2 + probe 2 + integration 3 = 10 passed）。

- [ ] **Step 2: 在 `docs/codegraph-schema.md` 末尾追加 "## M2 适配器输入"**

明确写出 M2 的 schema 适配器将使用的精确映射（从真实 schema 抄）：
- 全量取节点的 SQL：`SELECT <列...> FROM <节点表>`
- 全量取边的 SQL：`SELECT <列...> FROM <边表>`
- 节点 → archub 稳定 ID（`语言:文件路径:类型:限定名`）所需的源列映射：language ← ?、file path ← ?、kind ← ?、qualified name ← ?
- 边的 源/目标 如何关联到节点（外键/id 对应关系）

- [ ] **Step 3: 复核 go/no-go 与全图导出可行性**

确认三件事并在文档顶部用一句话标注结论：
1. Rust 抽取 = GO（引用 `verification-notes.md` 的结论）。
2. 节点表与边表已识别，列映射已写明。
3. 可一次性全量导出 nodes + edges（直读这两张表即可，无需 codegraph CLI 逐个查询）。

- [ ] **Step 4: 提交**

```bash
cd /home/hills/projects/archub
git add docs/codegraph-schema.md
git commit -m "docs: finalize codegraph schema mapping as M2 adapter input"
```

- [ ] **Step 5: 推送到 GitHub**

```bash
cd /home/hills/projects/archub && git push
```
Expected: 推送成功，远端 `origin/main` 更新。

---

## M1 完成判据（Definition of Done）

- `pnpm test` 全绿（含对 lifly 真实 DB 的集成测试）。
- `node dist/cli.js probe --project <repo>` 能打印任意 repo 的 codegraph schema。
- `docs/verification-notes.md` 给出 Rust 抽取的 GO/NO-GO 明确结论。
- `docs/codegraph-schema.md` 文档化真实表结构，并含 "M2 适配器输入" 精确映射。
- 所有改动已提交并推送。

**M1 完成后**：用其产出的真实 schema 撰写 M2 计划（适配器 + L0 图模型 + 聚合 + REST API + 探索模式 Web UI）。
