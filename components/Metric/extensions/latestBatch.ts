import { errorText } from '../service'
import type { MetricReadApi, MetricDataTarget, MetricRuntime, MetricValue } from '../types'

/** 先按实际目标归组再按接口上限切批；单次读取与持续订阅共用同一请求边界。 */
export function metricLatestBatches(ids: string[], targets?: ReadonlyMap<string, MetricDataTarget | undefined>) {
  const groups = new Map<string, { target: MetricDataTarget | undefined; ids: string[] }>()
  for (const id of ids) {
    const target = targets?.get(id), key = JSON.stringify([target?.targetType, target?.targetId])
    const group = groups.get(key)
    if (group) group.ids.push(id)
    else groups.set(key, { target, ids: [id] })
  }
  return [...groups.values()].flatMap(group => {
    const batches: { target: MetricDataTarget | undefined; ids: string[] }[] = []
    for (let start = 0; start < group.ids.length; start += 128) batches.push({ target: group.target, ids: group.ids.slice(start, start + 128) })
    return batches
  })
}

/** Only successful bounded batches may revoke omitted IDs; failed batches retain their prior snapshot. */
export async function loadMetricLatest(api: Pick<MetricReadApi, 'latest'>, ids: string[], previous: Record<string, Record<string, MetricValue>>, denied: string[], isCurrent: () => boolean, previousRuntime: Record<string, MetricRuntime> = {}, targets?: ReadonlyMap<string, MetricDataTarget | undefined>) {
  const outputs = Object.fromEntries(ids.filter(id => Object.prototype.hasOwnProperty.call(previous, id)).map(id => [id, previous[id]]))
  const runtimes = Object.fromEntries(ids.filter(id => Object.prototype.hasOwnProperty.call(previousRuntime, id)).map(id => [id, previousRuntime[id]]))
  const inaccessible = new Set(denied.filter(id => ids.includes(id)))
  const errors: Record<string, string> = {}
  for (const { ids: batchIds, target } of metricLatestBatches(ids, targets)) {
    if (!isCurrent()) return
    try {
      const response = await api.latest(batchIds, target)
      if (!isCurrent()) return
      const readable = new Map(response.filter(item => !item.inaccessible && batchIds.includes(item.configId)).map(item => [item.configId, item]))
      for (const id of batchIds) {
        const item = readable.get(id)
        if (item) {
          outputs[id] = item.outputs
          // 缺反馈表示当前节点未反馈，不能沿用上次的 loaded/failed。
          if (item.runtime) runtimes[id] = item.runtime
          else delete runtimes[id]
          inaccessible.delete(id)
        } else { delete outputs[id]; delete runtimes[id]; inaccessible.add(id) }
      }
    } catch (cause) {
      if (!isCurrent()) return
      for (const id of batchIds) errors[id] = errorText(cause)
    }
  }
  return { outputs, runtimes, inaccessibleIds: [...inaccessible], errors }
}
