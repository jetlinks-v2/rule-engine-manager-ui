export interface RuleListItem {
  id: string
  name: string
  description?: string
  state?: { value: string; text: string }
  modelType?: string
  modelVersion?: number
  createTime: number
}

export interface RuleRuntimeInfo {
  id: string
  observationStatus: 'ready' | 'partial' | 'unavailable'
  runtimeState: 'running' | 'partial' | 'paused' | 'stopped' | 'unknown'
  runningReplicas: number
  totalReplicas: number
  errorCount?: number | string | null
  lastExecutionTime?: number | null
  inputRate?: number | null
  outputRate?: number | null
  buffered?: number | string | null
}

export interface RuleRuntimeFrame { timestamp: number; rules: RuleRuntimeInfo[] }

/** Cards have a fixed reading height, so off-screen DOM can be released without measuring every rule. */
export const RULE_ROW_HEIGHT = 240
export function ruleListWindow(count: number, width: number, height: number, scrollTop: number) {
  const columns = Math.max(1, Math.min(4, Math.floor((width + 16) / 260)))
  const rows = Math.ceil(count / columns)
  const firstRow = Math.max(0, Math.min(rows, Math.floor(scrollTop / RULE_ROW_HEIGHT) - 1))
  const endRow = Math.min(rows, firstRow + Math.min(Math.ceil(height / RULE_ROW_HEIGHT) + 3, Math.floor(64 / columns)))
  return { columns, start: firstRow * columns, end: endRow * columns, top: firstRow * RULE_ROW_HEIGHT,
    height: Math.max(0, rows * RULE_ROW_HEIGHT - 16) }
}
