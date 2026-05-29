# codegraph SQLite Schema

> **M1 Go/No-Go verdict (2026-05-29):** Rust extraction is GO (see `docs/verification-notes.md`); `nodes` and `edges` tables are fully identified with column mappings written below; the full architecture graph can be exported in one shot by reading these two tables directly — no per-symbol codegraph CLI queries are needed.

Empirically documented from the real lifly codegraph database.  
**codegraph version:** 0.9.7 (see `docs/verification-notes.md`)  
**DB path (per project):** `<project-root>/.codegraph/codegraph.db`  
**Schema versions in DB:** 1 ("Initial schema"), 4 ("Initial schema includes all migrations")

---

## Core Graph Tables

These three tables are used to build the architecture graph.

---

### `nodes` — 817 rows — PRIMARY SYMBOL STORE

Each row is one code symbol (function, struct, file, import, etc.).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key. Format: `<kind>:<path-or-hash>` (e.g. `function:55cf8842f22617f1...`, `file:server/src/bin/hash_password.rs`) |
| `kind` | TEXT | Symbol kind — see distribution below |
| `name` | TEXT | Bare symbol name (e.g. `main`, `hash_password.rs`) |
| `qualified_name` | TEXT | Fully-qualified name (may include module path) |
| `file_path` | TEXT | Relative path from project root to the source file |
| `language` | TEXT | Source language — see distribution below |
| `start_line` | INTEGER | 1-based start line in the file |
| `end_line` | INTEGER | 1-based end line in the file |
| `start_column` | INTEGER | 0-based start column |
| `end_column` | INTEGER | 0-based end column |
| `docstring` | TEXT | Extracted doc comment (nullable) |
| `signature` | TEXT | Symbol signature / type annotation (nullable) |
| `visibility` | TEXT | `pub`, `private`, etc. (nullable) |
| `is_exported` | INTEGER | Boolean (0/1) |
| `is_async` | INTEGER | Boolean (0/1) |
| `is_static` | INTEGER | Boolean (0/1) |
| `is_abstract` | INTEGER | Boolean (0/1) |
| `decorators` | TEXT | JSON array of decorators (nullable) |
| `type_parameters` | TEXT | JSON array of generic type params (nullable) |
| `updated_at` | INTEGER | Unix timestamp (ms) of last index update |

**`nodes.kind` distribution (lifly):**

| kind | count |
|------|-------|
| import | 313 |
| function | 237 |
| file | 77 |
| struct | 65 |
| method | 54 |
| interface | 28 |
| constant | 20 |
| enum_member | 14 |
| enum | 3 |
| type_alias | 3 |
| variable | 2 |
| class | 1 |

**`nodes.language` distribution (lifly):**

| language | count |
|----------|-------|
| rust | 545 |
| typescript | 151 |
| tsx | 114 |
| javascript | 7 |

**Key M2 fields:** `id` (join key), `name` + `qualified_name` (symbol lookup), `file_path` (source location), `kind` (symbol type), `language` (determines parser/resolver).

---

### `edges` — 1773 rows — RELATIONSHIP STORE

Each row is a directed relationship between two nodes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Auto-increment primary key |
| `source` | TEXT | **Foreign key → `nodes.id`** (the originating node) |
| `target` | TEXT | **Foreign key → `nodes.id`** (the destination node) |
| `kind` | TEXT | Relationship kind — see distribution below |
| `metadata` | TEXT | JSON blob with extra relationship data (nullable) |
| `line` | INTEGER | Source line where the relationship occurs (nullable) |
| `col` | INTEGER | Source column (nullable) |
| `provenance` | TEXT | How this edge was discovered (nullable; often NULL) |

**`edges.kind` distribution (lifly):**

| kind | count |
|------|-------|
| contains | 768 |
| calls | 385 |
| imports | 313 |
| references | 306 |
| instantiates | 1 |

**Empirically confirmed join integrity (all 1773 edges):**
- `SELECT COUNT(*) FROM edges e JOIN nodes n ON e.source = n.id` → **1773** (100% of source endpoints resolve)
- `SELECT COUNT(*) FROM edges e JOIN nodes n ON e.target = n.id` → **1773** (100% of target endpoints resolve)
- Both endpoints resolve simultaneously → **1773** (zero dangling edges)

**Conclusion: `edges.source` and `edges.target` are clean foreign keys to `nodes.id`.** M2 can join `edges` to `nodes` with no null-handling required.

**Sample edges (id 1–5):**
```
source: "file:server/src/bin/hash_password.rs"  target: "import:aef6a46f..."     kind: "contains"
source: "file:server/src/bin/hash_password.rs"  target: "import:e6526e9e..."     kind: "contains"
source: "file:server/src/bin/hash_password.rs"  target: "import:4b8269f8..."     kind: "contains"
source: "file:server/src/bin/hash_password.rs"  target: "function:55cf8842..."   kind: "contains"
source: "file:server/src/capability/handlers.rs" target: "import:b15ff671..."   kind: "contains"
```

---

### `files` — 81 rows — FILE MANIFEST

One row per indexed source file.

| Column | Type | Notes |
|--------|------|-------|
| `path` | TEXT | Relative path from project root |
| `content_hash` | TEXT | Hash of file content (for change detection) |
| `language` | TEXT | Source language |
| `size` | INTEGER | File size in bytes |
| `modified_at` | INTEGER | File mtime (Unix ms) |
| `indexed_at` | INTEGER | When codegraph last indexed this file (Unix ms) |
| `node_count` | INTEGER | Number of nodes extracted from this file |
| `errors` | TEXT | JSON array of parse/index errors (nullable) |

---

## Auxiliary Tables (ignore — not used for graph building)

| Table | Rows | Purpose |
|-------|------|---------|
| `nodes_fts` | 817 | FTS5 virtual table for full-text search over nodes. Columns: `id`, `name`, `qualified_name`, `docstring`, `signature`. **Do not use for graph traversal.** |
| `nodes_fts_config` | 1 | FTS5 internal shadow table (config k/v) |
| `nodes_fts_data` | 24 | FTS5 internal shadow table (inverted index data blocks) |
| `nodes_fts_docsize` | 817 | FTS5 internal shadow table (per-document token counts) |
| `nodes_fts_idx` | 22 | FTS5 internal shadow table (segment index) |
| `project_metadata` | 0 | Key-value store for project-level metadata (empty in lifly) |
| `schema_versions` | 2 | Migration history: version INT, applied_at INT, description TEXT |
| `unresolved_refs` | 0 | Symbols referenced but not resolved to a node (empty in lifly). Columns: `id`, `from_node_id`, `reference_name`, `reference_kind`, `line`, `col`, `candidates`, `file_path`, `language` |

---

## M2 Design Notes

### Build the graph by reading `edges` directly

The codegraph CLI's `callers`/`callees` commands resolve by **bare symbol name** and can produce cross-language false positives (e.g., a Rust function named `render` matching a React component named `render`). M2 must build the graph by querying the `edges` table directly:

```sql
SELECT e.kind, n_src.qualified_name AS src, n_tgt.qualified_name AS tgt
FROM edges e
JOIN nodes n_src ON e.source = n_src.id
JOIN nodes n_tgt ON e.target = n_tgt.id
WHERE e.kind = 'calls'
  AND n_src.language = 'typescript'
```

This is safe because `source`/`target` are node IDs (not names), so there are no cross-language collisions.

### Node ID format

Node IDs are `<kind>:<discriminator>` where `<discriminator>` is:
- A **relative file path** for `file` nodes (e.g. `file:server/src/lib.rs`)
- A **content hash** (hex) for all other symbol kinds (e.g. `function:55cf8842f22617f1...`)

This means nodes survive file renames only if re-indexed; hash stability across codegraph versions is not guaranteed.

### Edge kinds

| kind | meaning |
|------|---------|
| `contains` | A file or module contains a symbol (structural containment) |
| `calls` | A function/method calls another function/method |
| `imports` | A file/symbol imports another module/symbol |
| `references` | A symbol references another (type reference, field access, etc.) |
| `instantiates` | A symbol instantiates a class/struct (1 occurrence in lifly) |

---

## M2 适配器输入 (M2 Adapter Input)

This section defines the exact SQL and column mappings the M2 schema adapter will use to export the full architecture graph from codegraph's SQLite database in one shot.

### Node export SQL

```sql
SELECT
  id,
  kind,
  name,
  qualified_name,
  file_path,
  language,
  start_line,
  end_line,
  start_column,
  end_column,
  docstring,
  signature,
  visibility,
  is_exported,
  is_async,
  is_static,
  is_abstract,
  decorators,
  type_parameters,
  updated_at
FROM nodes
```

All 20 columns are exported. `id` is the join key for edges. The remaining columns provide symbol metadata for the archub graph.

### Edge export SQL

```sql
SELECT
  id,
  source,
  target,
  kind,
  metadata,
  line,
  col,
  provenance
FROM edges
```

All 8 columns are exported. `source` and `target` are 100% clean foreign keys to `nodes.id` (empirically verified on lifly: all 1773 edges resolve, zero dangling). No null-handling is required when joining edges to nodes.

### archub stable node ID — source column mapping

archub assigns each node a stable ID of the form `language:file_path:kind:qualified_name[:start_line]` (see disambiguation note below). The columns that compose this ID are:

| archub stable ID component | source column |
|----------------------------|--------------|
| `language` | `nodes.language` |
| `file_path` | `nodes.file_path` |
| `kind` | `nodes.kind` |
| `qualified_name` | `nodes.qualified_name` |
| `start_line` *(disambiguation suffix — see below)* | `nodes.start_line` |

This is distinct from codegraph's own `nodes.id` (a content hash for symbols, a file path for `file` nodes). codegraph's ID is not stable across renames or codegraph version upgrades; archub's composite key is human-readable and version-independent.

### Edge → node foreign key relationship

```
edges.source  →  nodes.id   (the originating node)
edges.target  →  nodes.id   (the destination node)
```

Both endpoints are verified clean (lifly: 1773/1773 edges, both endpoints, zero dangling).

### Stable ID uniqueness — empirical finding (lifly, 817 nodes)

**The 4-component key `language:file_path:kind:qualified_name` is NOT unique on lifly.**

- **33 collision groups, 85 nodes involved** (out of 817 total)
- All collisions are in **Rust `import` nodes**: multiple `use axum::...` statements in the same file all share `language=rust`, the same `file_path`, `kind=import`, and the same top-level crate name as `qualified_name` (e.g. `"axum"`, `"std"`, `"argon2"`).
- Representative examples:
  - `rust:server/src/data/handlers.rs:import:"axum"` — **7 rows** (7 separate `use axum::...` lines, start_lines 1–7)
  - `rust:server/src/common/config.rs:import:"std"` — **4 rows** (start_lines 1–4)

**Recommendation: use a 5-component stable ID for M2:**

```
language:file_path:kind:qualified_name:start_line
```

Adding `start_line` fully resolves all 33 collision groups (verified: 0 remaining collisions after adding `start_line`). The disambiguated key `language:file_path:kind:qualified_name:start_line` is unique across all 817 nodes in lifly.

For non-import nodes (functions, structs, methods, etc.) `start_line` is almost always unique within a file for a given kind+qualified_name tuple, but including it unconditionally keeps the ID format consistent and future-proof.
