// 只忽略编辑器补齐的展示信息；配置和值使用原始内容，避免把名为 key/options 的业务参数漏掉。
const displayFields = new Set(['key', 'error', 'branches_Index', 'summary', 'summaryTitle', 'editorMode', 'productName', 'deviceNames', 'scopeOptions'])
const payloadFields = new Set(['configuration', 'config', 'message', 'value', 'inputs', 'properties'])

function normalize(value: unknown, payload: boolean, detailed: boolean): unknown {
  if (Array.isArray(value)) return value.map(item => normalize(item, payload, detailed))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .filter(([key, item]) => item !== undefined && (payload || !displayFields.has(key) && !(detailed && key === 'options')))
    .map(([key, item]) => [key, normalize(item, payload || payloadFields.has(key), detailed)]))
}

/** 比较用户配置，自动摘要、标签补齐和临时 UI key 不构成未保存修改。 */
export const sceneDraftSnapshot = (draft: unknown): string => {
  // 详细规则的结构层 options 是展示副本；快速表单的 alarm.options 则含有真实来源 ID。
  const detailed = Boolean(draft && typeof draft === 'object' && 'branches' in draft && !('triggerKind' in draft))
  return JSON.stringify(normalize(draft, false, detailed))
}
