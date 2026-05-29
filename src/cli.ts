#!/usr/bin/env node
import { Command } from 'commander'
import { getVersion } from './version.js'
import { probe, formatProbe } from './db/probe.js'
import { startServer } from './server/serve.js'
import { openCodegraphDb } from './db/connect.js'
import { GraphService } from './graph/service.js'
import type { Level } from './graph/types.js'

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

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
