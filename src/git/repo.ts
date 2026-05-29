import { simpleGit, type SimpleGit } from 'simple-git'
import type { CommitInfo, RefInfo } from '../diff/types.js'

export class GitRepo {
  private readonly git: SimpleGit
  constructor(projectRoot: string) {
    this.git = simpleGit(projectRoot)
  }

  async currentSha(): Promise<string> {
    return (await this.git.revparse(['HEAD'])).trim()
  }

  async resolveRef(ref: string): Promise<string> {
    return (await this.git.revparse([ref])).trim()
  }

  async refs(): Promise<RefInfo> {
    const currentSha = (await this.git.revparse(['HEAD'])).trim()
    const branch = await this.git.branchLocal()
    const log = await this.git.log({ maxCount: 30 })
    const commits: CommitInfo[] = log.all.map((c) => ({ sha: c.hash, message: c.message, date: c.date }))
    return { currentSha, branches: branch.all, commits, snapshots: [] } // snapshots filled by callers
  }
}
