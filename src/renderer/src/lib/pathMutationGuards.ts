export interface PathMutationGuard {
  basePath: string
  blockedPaths: string[]
}

const activeGuards: PathMutationGuard[] = []

export function isAffectedPath(pathToCheck: string, basePath: string): boolean {
  return pathToCheck === basePath || pathToCheck.startsWith(`${basePath}/`)
}

export function beginPathMutation(basePath: string): PathMutationGuard {
  const guard: PathMutationGuard = { basePath, blockedPaths: [] }
  activeGuards.push(guard)
  return guard
}

export function endPathMutation(guard: PathMutationGuard): void {
  const index = activeGuards.indexOf(guard)
  if (index !== -1) activeGuards.splice(index, 1)
}

export function pathMutationGuardFor(pathToCheck: string): PathMutationGuard | null {
  return activeGuards.find((guard) => isAffectedPath(pathToCheck, guard.basePath)) ?? null
}

export function isPathUnderMutation(pathToCheck: string): boolean {
  return pathMutationGuardFor(pathToCheck) != null
}

export function resetPathMutationGuards(): void {
  activeGuards.splice(0, activeGuards.length)
}
