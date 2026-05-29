import { Router } from 'express'
import type { GraphService } from '../graph/service.js'
import type { Level } from '../graph/types.js'

const LEVELS: Level[] = ['module', 'file', 'function']

export function apiRouter(svc: GraphService): Router {
  const r = Router()

  // 注意(express 5 + @types/express): handler 不要 `return res.json(...)`(返回 Response 触发类型错);
  // 用 `res.json(...); return` 的早返回风格。
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

  return r
}
