export type AlarmEventSource = 'vision' | 'iot'
export type AlarmEventStatus = 'open' | 'handled'
export type AlarmEventSeverity = 'high' | 'med' | 'low'

export interface AlarmEventHandleContext {
  alarmRecordId?: string
  alarmConfigId: string
  alarmTime: number
  recordCreatorId?: string
  level?: number
  targetType?: string
  targetName?: string
  targetId?: string
  sourceType?: string
  sourceId?: string
  sourceName?: string
  alarmConfigSource?: string
  triggerDesc?: string
  actualDesc?: string
}

/** Minimal normalized alarm record shared by the agent services, never the raw backend object. */
export interface AlarmEventItem {
  id: string
  historyId?: string
  source: AlarmEventSource
  sourceId?: string
  pack: string
  taskTargetName?: string
  algoId: string
  algo: string
  store: string
  loc: string
  regionPath: string
  time: string
  level?: number
  levelLabel?: string
  levelShortLabel?: string
  severity: AlarmEventSeverity
  status: AlarmEventStatus
  summary?: string
  ruleName?: string
  handleContext?: AlarmEventHandleContext
}

export interface AlarmEventPage {
  data: AlarmEventItem[]
  total: number
}

export interface AlarmEventQueryOptions {
  recordId?: string
  sourceIds?: string[]
  sceneId?: string
  algorithmId?: string
  level?: number
  state?: 'all' | 'warning' | 'normal'
  searchKeyword?: string
  timestampRange?: [number, number]
  pageIndex?: number
  pageSize?: number
}

export interface AlarmHandleHistoryItem {
  alarmTime: string
  handleTime: string
  state: 'warning' | 'normal'
  stateText: string
  handleType: string
  handleResult: string
}

export interface AlarmHandleHistoryPage {
  data: AlarmHandleHistoryItem[]
  total: number
}

export interface AlarmNoiseStats {
  total: number
  valid: number
  filtered: number
  filterRate: number
  validRate: number
}

export type EventSelection =
  | { dim: 'scene'; value?: string; sub?: string | null }
  | { dim: 'region'; value?: string; sub?: string | null }
  | { dim: 'sev'; value?: string; sub?: string | null }

export interface AlarmLevelConfig {
  level?: number | string
  title?: string
  name?: string
  i18nMessages?: Record<string, string>
  [key: string]: unknown
}

export interface AlarmLevelOption {
  level: number
  value: number
  label: string
  shortLabel: string
  tone: AlarmEventSeverity
  raw: AlarmLevelConfig
}

export interface AiSceneAlgorithm {
  value?: string
  text?: string
  description?: string
  alarmRecordCount?: number
}

export interface AiSceneTreeItem {
  id?: string
  name?: string
  category?: string
  description?: string
  alarmRecordCount?: number
  taskTargetDetails?: AiSceneAlgorithm[]
  children?: AiSceneAlgorithm[]
}
