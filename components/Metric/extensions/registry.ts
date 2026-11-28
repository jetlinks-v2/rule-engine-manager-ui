import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import type { ModuleResource } from '@jetlinks-web-core/types/module'
import type { MetricDimensionProvider, MetricPresentationProvider } from '../types'

export interface MetricResourceIssue { type: 'invalid-dimension' | 'duplicate-dimension' | 'invalid-presentation'; moduleId: string; key: string }
export interface RegisteredMetricDimension { moduleId: string; provider: MetricDimensionProvider }
export interface RegisteredMetricPresentation { id: string; moduleId: string; provider: MetricPresentationProvider }
export interface MetricResources { dimensions: RegisteredMetricDimension[]; presentations: RegisteredMetricPresentation[]; issues: MetricResourceIssue[] }
type Registry = { getAllModules(): Map<string, ModuleResource> }
const component = (value: unknown) => typeof value === 'function' || (typeof value === 'object' && value !== null && !Array.isArray(value))
const label = (value: unknown) => typeof value === 'string' || typeof value === 'function'
export const DEFAULT_METRIC_PRESENTATION = 'builtin/default'
const defaultProvider: MetricPresentationProvider = { label: 'Default' }
const record = (value: unknown): value is Record<string, unknown> => value !== null && (typeof value === 'object' || typeof value === 'function')
const dimensionProvider = (value: unknown, key: string): value is MetricDimensionProvider => record(value)
  && !!key && value.ownerType === key && label(value.label) && component(value.navigator)
  && ['useSourcePicker', 'available', 'canEdit', 'toBusiness'].every(field => value[field] === undefined || typeof value[field] === 'function')
const presentationProvider = (value: unknown): value is MetricPresentationProvider => record(value) && label(value.label)
  && ['card', 'detail', 'configFields', 'presentationFields'].every(slot => value[slot] === undefined || component(value[slot]))

/** Collect installed resources only. Conflicting dimensions are isolated instead of depending on load order. */
export function collectMetricResources(registry: Registry = moduleRegistry): MetricResources {
  const candidates: RegisteredMetricDimension[] = []
  const presentations: RegisteredMetricPresentation[] = [{ id: DEFAULT_METRIC_PRESENTATION, moduleId: 'builtin', provider: defaultProvider }]
  const issues: MetricResourceIssue[] = []
  for (const [moduleId, resources] of registry.getAllModules()) {
    for (const [key, provider] of Object.entries(resources.metricDimensions || {})) {
      if (!dimensionProvider(provider, key)) {
        issues.push({ type: 'invalid-dimension', moduleId, key }); continue
      }
      candidates.push({ moduleId, provider })
    }
    for (const [key, provider] of Object.entries(resources.metricPresentations || {})) {
      if (!key || key.includes('/') || moduleId === 'builtin' || !presentationProvider(provider)) {
        issues.push({ type: 'invalid-presentation', moduleId, key }); continue
      }
      presentations.push({ id: `${moduleId}/${key}`, moduleId, provider })
    }
  }
  const duplicates = new Set(candidates.filter((item, index, all) => all.some((other, otherIndex) => otherIndex !== index && other.provider.ownerType === item.provider.ownerType)).map(item => item.provider.ownerType))
  const dimensions = candidates.filter(item => {
    if (duplicates.has(item.provider.ownerType)) { issues.push({ type: 'duplicate-dimension', moduleId: item.moduleId, key: item.provider.ownerType }); return false }
    try { return item.provider.available?.() !== false }
    catch { issues.push({ type: 'invalid-dimension', moduleId: item.moduleId, key: item.provider.ownerType }); return false }
  }).sort((a, b) => (a.provider.order || 0) - (b.provider.order || 0))
  return { dimensions, presentations, issues }
}

/** A backend string is only a lookup key. It can never load a URL or executable component. */
export function resolveMetricPresentation(reference?: unknown, resources = collectMetricResources()) {
  const id = reference == null || reference === '' ? DEFAULT_METRIC_PRESENTATION : typeof reference === 'string' ? reference : ''
  const provider = resources.presentations.find(item => item.id === id)?.provider
  return { id, provider, missing: !provider }
}
