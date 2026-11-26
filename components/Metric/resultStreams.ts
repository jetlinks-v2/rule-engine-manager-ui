import type { MetricReadApi, MetricResultFrame } from './types'

type Watch = NonNullable<MetricReadApi['watchResults']>
type Entry = { subscriptionId: string; configId: string; query: Parameters<Watch>[1]; ready: boolean; next: Parameters<Watch>[2]; error: Parameters<Watch>[3] }
export interface MetricWatchTarget { subscriptionId: string; configId: string; query: Parameters<Watch>[1]; includeHistory: boolean }
export interface MetricWatchFrame { subscriptionId: string; frame?: MetricResultFrame; error?: string }

/** 可见卡片共用 NDJSON；变更集合时只补读尚未完成的历史，旧连接不能回填新订阅。 */
export function createMetricResultStreams(open: (targets: MetricWatchTarget[], next: (value: MetricWatchFrame) => void, error: (cause: unknown) => void) => () => void): Watch {
  const entries = new Map<string, Entry>()
  let sequence = 0, generation = 0, scheduled = false
  let stops: (() => void)[] = []
  function schedule() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(rebuild)
  }
  function rebuild() {
    scheduled = false
    const epoch = ++generation
    stops.forEach(stop => stop()); stops = []
    const current = [...entries.values()]
    // 一个连接最多128项，与服务端预算一致；通常一个可视面板只需一个连接。
    for (let offset = 0; offset < current.length; offset += 128) {
      const batch = current.slice(offset, offset + 128)
      const fail = (cause: unknown) => {
        if (generation !== epoch) return
        for (const entry of batch) if (entries.get(entry.subscriptionId) === entry) {
          entries.delete(entry.subscriptionId); entry.error(cause)
        }
        schedule()
      }
      const stop = open(batch.map(entry => ({ subscriptionId: entry.subscriptionId, configId: entry.configId, query: entry.query, includeHistory: !entry.ready })), value => {
        if (generation !== epoch) return
        const entry = entries.get(value.subscriptionId)
        if (!entry || !batch.includes(entry)) return
        if (value.error) { entries.delete(entry.subscriptionId); entry.error(new Error(value.error)); schedule(); return }
        if (!value.frame) return
        if (value.frame.kind === 'reset') entry.ready = false
        if (value.frame.kind === 'ready' || value.frame.kind === 'inaccessible') entry.ready = true
        entry.next(value.frame)
      }, fail)
      stops.push(stop)
    }
  }
  return (configId, query, next, error) => {
    const subscriptionId = String(++sequence)
    entries.set(subscriptionId, { subscriptionId, configId, query, ready: false, next, error }); schedule()
    return () => { if (entries.delete(subscriptionId)) schedule() }
  }
}
