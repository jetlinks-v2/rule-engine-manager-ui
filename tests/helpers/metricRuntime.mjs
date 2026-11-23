import { existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const moduleRoot = fileURLToPath(new URL('../..', import.meta.url))
const coreRoot = process.env.JETLINKS_WEB_CORE_ROOT || resolve(moduleRoot, '../../jetlinks-web-core')
const shared = await import(pathToFileURL(resolve(coreRoot, 'tests/helpers/metricRuntime.mjs')))
export const { sourceRoot, createMetricRenderer, flush, walk, textContent, passthrough } = shared

// Execute moved sources and shared rendering with the same compiler and browser boundaries.
export function createMetricLoader(stubs = {}) {
  const metricRoot = resolve(sourceRoot, 'components/Metric')
  const ownedPath = filename => resolve(moduleRoot, 'components/Metric', relative(metricRoot, filename))
  const resolvePath = filename => filename.startsWith(metricRoot + '/') && !existsSync(filename) && existsSync(ownedPath(filename)) ? ownedPath(filename) : filename
  const aliases = { ...stubs }
  for (const [filename, stub] of Object.entries(stubs)) {
    if (filename.startsWith(metricRoot + '/') && existsSync(ownedPath(filename))) aliases[ownedPath(filename)] = stub
  }
  const load = shared.createMetricLoader(aliases, resolvePath)
  return filename => {
    if (filename === 'components/Metric/api.ts') return { ...load(filename), ...load(resolve(moduleRoot, 'components/Metric/api.ts')) }
    if (filename === 'components/Metric/service.ts') return { ...load(filename), ...load(resolve(moduleRoot, 'components/Metric/service.ts')) }
    return load(filename)
  }
}
