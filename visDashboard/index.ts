const nestedModules = import.meta.glob('./*/*/index.ts', { eager: true })
const topModules = import.meta.glob('./*/index.ts', { eager: true })

const allExports: Record<string, unknown> = {}

for (const mod of [...Object.values(nestedModules), ...Object.values(topModules)]) {
  const module = mod as Record<string, unknown>
  for (const key in module) {
    if (key !== 'default') {
      allExports[key] = module[key]
    }
  }
}

export default allExports
