import type { MetricConfig } from './types'

export const metricFeatured = (config?: Pick<MetricConfig, 'presentation'>) => config?.presentation?.featured === true
export function metricDisplayOrder(config?: Pick<MetricConfig, 'presentation'>): number {
  const value = config?.presentation?.order
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : Number.MAX_SAFE_INTEGER
}
export function compareMetricPresentation(a: Pick<MetricConfig,'id'|'presentation'>, b: Pick<MetricConfig,'id'|'presentation'>): number {
  return Number(metricFeatured(b)) - Number(metricFeatured(a)) || metricDisplayOrder(a) - metricDisplayOrder(b)
    || String(a.id || '').localeCompare(String(b.id || ''), 'en')
}
/** 位置调整不会暗改关注或归属；只接收同组的稳定配置身份。 */
export function moveMetric(ids: string[], moving: string, target: string, after = false): string[] {
  if (moving === target || !ids.includes(moving) || !ids.includes(target)) return ids
  const next = ids.filter(id => id !== moving)
  next.splice(next.indexOf(target) + Number(after), 0, moving)
  return next
}
