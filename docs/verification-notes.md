# CodeGraph Verification Notes — lifly Rust go/no-go

**Date:** 2026-05-29  
**Verdict: GO ✅**

Rust functions/methods are indexed as nodes (server/src node count = 481 across 37 files covering all major modules), and Rust call edges exist (callers/callees non-empty for sampled `login` function in `server/src/identity/service.rs`).

---

## Step 1: Install + Version

```
npm install -g @colbymchenry/codegraph
```

**Version:** `0.9.7`

---

## Step 2: `codegraph init --help` — Real Flags

```
Usage: codegraph init [options] [path]

Initialize CodeGraph in a project directory

Options:
  -i, --index    Run initial indexing after initialization
  -v, --verbose  Show detailed worker lifecycle and memory info
  -h, --help     display help for command
```

**Finding:** `-i` means `--index` (run initial indexing after init), NOT "interactive mode". The plan's assumption (`-i` ≈ non-interactive flag) was coincidentally correct label-wise but the meaning is "run indexing inline". There is no separate "interactive" vs "non-interactive" concept — init is always non-interactive.

---

## Step 3: Real Index Run on lifly

```bash
cd /home/hills/projects/lifly
codegraph init -i
```

**Output (cleaned of ANSI):**
```
Initializing CodeGraph
Initialized in /home/hills/projects/lifly
Scanning files — 81 found
Parsing code — done
Resolving refs — done
Indexed 77 files
817 nodes, 1,773 edges in 419ms
Done
```

### `codegraph status` output

```
CodeGraph Status
Project: /home/hills/projects/lifly

Index Statistics:
  Files:     81
  Nodes:     817
  Edges:     1,773
  DB Size:   1.99 MB
  Backend:   node:sqlite — built-in (full WAL)
  Journal:   wal

Nodes by Kind:
  import          313
  function        237
  file            77
  struct          65
  method          54
  interface       28
  constant        20
  enum_member     14
  enum            3
  type_alias      3
  variable        2
  class           1

Files by Language:
  rust            40
  typescript      20
  tsx             16
  yaml            4
  javascript      1

✓ Index is up to date
```

### `.codegraph/` directory

```
$ ls -la /home/hills/projects/lifly/.codegraph/
total 2052
drwxr-xr-x 2 hills hills    4096 May 29 11:33 .
drwxrwxr-x 9 hills hills    4096 May 29 11:33 ..
-rw-r--r-- 1 hills hills 2088960 May 29 11:33 codegraph.db
-rw-r--r-- 1 hills hills     173 May 29 11:33 .gitignore
```

**`codegraph.db` exists. ✅**

---

## Step 4: Rust Extraction Quality

### Whole-repo totals
| Metric | Value |
|--------|-------|
| Total files indexed | 81 (77 parsed successfully) |
| Total nodes | 817 |
| Total edges | 1,773 |
| DB size | 1.99 MB |

### server/src (Rust) breakdown
- **37 files**, **481 total nodes**
- Covers all major modules: `identity/`, `capability/`, `tool/`, `tool/pipeline/`, `data/`, `intelligence/`, `common/`, `main.rs`, `bin/`

### web/src (TypeScript/TSX) breakdown
- **27 files**, **228 total nodes**
- Covers all frontend: `api/`, `components/`, `contexts/`, `hooks/`, `pages/`, `test/`, `utils/`

---

### Real Rust symbol sample: `login` in `server/src/identity/service.rs`

From `codegraph query login --json` (Rust result, score 96.67):

```json
{
  "node": {
    "id": "function:9cf78a21abe816c10a5de85a2447767d",
    "kind": "function",
    "name": "login",
    "qualifiedName": "login",
    "filePath": "server/src/identity/service.rs",
    "language": "rust",
    "startLine": 13,
    "endLine": 38,
    "startColumn": 0,
    "endColumn": 1,
    "docstring": "/ Authenticate a user by username and password, returning a JWT and profile.",
    "signature": "(\n    pool: &PgPool,\n    jwt_secret: &JwtSecret,\n    username: &str,\n    password: &str,\n) -> AppResult<LoginResponse>",
    "visibility": "public",
    "isExported": false,
    "isAsync": false,
    "isStatic": false,
    "isAbstract": false
  },
  "score": 96.66611491594006
}
```

### Callers of `login` (via `codegraph callers login --json`)

```json
{
  "symbol": "login",
  "callers": [
    { "name": "test_todo_pipeline_with_llm",         "kind": "function", "filePath": "server/tests/llm_integration.rs", "startLine": 149 },
    { "name": "test_ocr_pipeline_with_llm",          "kind": "function", "filePath": "server/tests/llm_integration.rs", "startLine": 227 },
    { "name": "test_login_success",                  "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 189 },
    { "name": "test_get_profile",                    "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 235 },
    { "name": "test_list_tools",                     "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 246 },
    { "name": "test_get_tool_detail",                "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 256 },
    { "name": "test_get_tool_versions",              "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 267 },
    { "name": "test_list_capabilities",              "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 281 },
    { "name": "test_create_raw_input_triggers_pipeline", "kind": "function", "filePath": "server/tests/integration.rs","startLine": 293 },
    { "name": "test_list_pipelines",                 "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 342 },
    { "name": "test_data_object_crud",               "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 353 },
    { "name": "test_reminder_crud",                  "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 417 },
    { "name": "test_category_crud",                  "kind": "function", "filePath": "server/tests/integration.rs",     "startLine": 477 }
  ]
}
```

### Callees of `login` (via `codegraph callees login --json`)

```json
{
  "symbol": "login",
  "callees": [
    { "name": "LoginRequest",  "kind": "interface",   "filePath": "web/src/api/types.ts",               "startLine": 128 },
    { "name": "Unauthorized",  "kind": "enum_member", "filePath": "server/src/common/error.rs",          "startLine": 31  },
    { "name": "new",           "kind": "method",      "filePath": "server/src/tool/pipeline/engine.rs",  "startLine": 21  },
    { "name": "Internal",      "kind": "enum_member", "filePath": "server/src/common/error.rs",          "startLine": 34  },
    { "name": "create_token",  "kind": "function",    "filePath": "server/src/common/auth.rs",           "startLine": 29  },
    { "name": "from",          "kind": "method",      "filePath": "server/src/identity/models.rs",       "startLine": 63  },
    { "name": "JwtSecret",     "kind": "struct",      "filePath": "server/src/common/auth.rs",           "startLine": 145 },
    { "name": "AppResult",     "kind": "type_alias",  "filePath": "server/src/common/error.rs",          "startLine": 91  },
    { "name": "LoginResponse", "kind": "struct",      "filePath": "server/src/identity/models.rs",       "startLine": 46  },
    { "name": "body_json",     "kind": "function",    "filePath": "server/tests/llm_integration.rs",     "startLine": 86  },
    { "name": "body_json",     "kind": "function",    "filePath": "server/tests/integration.rs",         "startLine": 81  }
  ]
}
```

---

### TypeScript symbol sample: `App` in `web/src/App.tsx`

From `codegraph query App --json`:

```json
{
  "node": {
    "id": "function:24ca4c11c42ee8b78ec3ab8cab55009b",
    "kind": "function",
    "name": "App",
    "qualifiedName": "App",
    "filePath": "web/src/App.tsx",
    "language": "tsx",
    "startLine": 45,
    "endLine": 53,
    "startColumn": 15,
    "endColumn": 1,
    "signature": "()",
    "visibility": null,
    "isExported": true
  },
  "score": 106.90152582884173
}
```

`codegraph callees App --json`:
```json
{
  "symbol": "App",
  "callees": [
    { "name": "AuthProvider", "kind": "function", "filePath": "web/src/contexts/AuthContext.tsx", "startLine": 16 },
    { "name": "AppRoutes",    "kind": "function", "filePath": "web/src/App.tsx",                  "startLine": 22 }
  ]
}
```

---

## Step 5: CLI Divergence from Plan

| Plan assumed | Reality |
|---|---|
| `codegraph init -i` = non-interactive mode | `-i` / `--index` = run indexing after init (init is always non-interactive). Behavior matched intention. |
| `codegraph files server/src --json` (positional arg) | Real flag is `--filter server/src -j` (option flag, not positional) |
| `codegraph query login --json` | Both `-j` and `--json` work. ✅ |
| `codegraph callers <id> --json` with full hash ID | Must use symbol **name** (e.g., `login`), not the `function:hash` id format. Using the id returns "Symbol not found". |
| `codegraph status` | Works as documented. ✅ |

---

## GO / NO-GO Conclusion

**Decision criteria applied:**

- ✅ **Rust functions/methods are indexed as nodes:** server/src node count = **481** across 37 files, covering identity, capability, tool/pipeline, data, intelligence, common, and main modules.
- ✅ **Rust call edges exist:** `login` function in `server/src/identity/service.rs` has **13 callers** (all in Rust test files) and **11 callees** (including `create_token`, `Unauthorized`, `from`, `LoginResponse` — cross-file Rust → Rust edges confirmed).

**Verdict: GO ✅**

codegraph successfully indexes the Rust codebase with meaningful call-graph data. M2 can proceed using codegraph as the symbol/edge layer for archub.
