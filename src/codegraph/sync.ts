import { execFileSync } from 'node:child_process'

export interface SyncResult {
  ok: boolean
  message: string
}

/**
 * Best-effort `codegraph sync` in the given project so its SQLite index reflects
 * current code before archub reads it. Never throws — returns ok:false on failure
 * (e.g. codegraph not installed) so the caller can proceed with a clear warning.
 * `exec` is injectable for testing.
 */
export function syncCodegraph(projectRoot: string, exec: typeof execFileSync = execFileSync): SyncResult {
  try {
    exec('codegraph', ['sync'], { cwd: projectRoot, stdio: 'ignore' })
    return { ok: true, message: 'done' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
