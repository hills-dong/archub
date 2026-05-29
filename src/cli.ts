#!/usr/bin/env node
import { Command } from 'commander'
import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getVersion } from './version.js'
import { probe, formatProbe } from './db/probe.js'
import { startServer } from './server/serve.js'
import { openCodegraphDb } from './db/connect.js'
import { GraphService } from './graph/service.js'
import { loadL0Graph } from './graph/adapter.js'
import type { Level } from './graph/types.js'
import { GitRepo } from './git/repo.js'
import { writeSnapshot } from './snapshot/store.js'
import { DiffService, WORKING } from './diff/service.js'
import { toMarkdown } from './diff/report.js'
import { syncCodegraph } from './codegraph/sync.js'

const program = new Command()
program
  .name('archub')
  .description('Real-time code architecture visualization + diff review')
  .version(getVersion())

program
  .command('probe')
  .description('Inspect the codegraph SQLite schema (tables, columns, row counts)')
  .option('-p, --project <path>', 'project root', process.cwd())
  .option('--json', 'output JSON', false)
  .action((opts: { project: string; json: boolean }) => {
    const tables = probe(opts.project)
    console.log(opts.json ? JSON.stringify(tables, null, 2) : formatProbe(tables))
  })

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

program
  .command('snapshot')
  .description('Snapshot the current architecture graph, keyed by git HEAD sha')
  .option('-p, --project <path>', 'project root', process.cwd())
  .option('--no-sync', 'skip `codegraph sync` before snapshotting')
  .action(async (opts: { project: string; sync: boolean }) => {
    if (opts.sync) {
      const r = syncCodegraph(opts.project)
      if (r.ok) console.log('codegraph sync: done')
      else console.error(`codegraph sync failed — snapshot may be stale: ${r.message}`)
    }
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
    if (existsSync(hookPath)) {
      console.error(`A post-commit hook already exists at ${hookPath}. Remove it first, or add this line to it manually:\n  node "${bin}" snapshot --project "${resolve(opts.project)}"`)
      process.exitCode = 1
      return
    }
    mkdirSync(dirname(hookPath), { recursive: true })
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

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
