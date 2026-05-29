export interface ModuleRule {
  glob: string
  name: string
}
export interface ArchubConfig {
  modules?: ModuleRule[]
}

export function defaultModule(filePath: string): string {
  const parts = filePath.split('/')
  const srcIdx = parts.findIndex((p, i) => i >= 1 && (p === 'src' || p === 'lib'))
  if (srcIdx >= 1 && srcIdx + 1 < parts.length) {
    return `${parts.slice(0, srcIdx).join('/')}/${parts[srcIdx + 1]}`
  }
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
  return parts[0]
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const pattern = escaped.replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*')
  return new RegExp(`^${pattern}$`)
}

export function resolveModule(filePath: string, config?: ArchubConfig): string {
  for (const rule of config?.modules ?? []) {
    if (globToRegExp(rule.glob).test(filePath)) return rule.name
  }
  return defaultModule(filePath)
}
