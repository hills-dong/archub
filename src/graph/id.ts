export interface IdParts {
  language: string
  filePath: string
  kind: string
  qualifiedName: string
  startLine: number
}

export function archubId(p: IdParts): string {
  return `${p.language}:${p.filePath}:${p.kind}:${p.qualifiedName}:${p.startLine}`
}
