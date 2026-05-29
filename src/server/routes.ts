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
