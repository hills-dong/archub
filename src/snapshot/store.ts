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
