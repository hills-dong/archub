#!/usr/bin/env node
import { Command } from 'commander'
import { getVersion } from './version.js'
import { probe, formatProbe } from './db/probe.js'

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

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
