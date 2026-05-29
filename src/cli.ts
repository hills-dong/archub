#!/usr/bin/env node
import { Command } from 'commander'
import { getVersion } from './version.js'

const program = new Command()
program
  .name('archub')
  .description('Real-time code architecture visualization + diff review')
  .version(getVersion())

program.parseAsync(process.argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
