export type TimeRangeQuery = {
  startTime?: number
  endTime?: number
}

export type VisionAlarmState = 'active' | 'handled'

export type VisionAlarmRankQuery = TimeRangeQuery & {
  limit: number
}

export type VisionAlarmTypeDistributionQuery = TimeRangeQuery & {
  limit: number
}

export type VisionAlarmListQuery = TimeRangeQuery & {
  pageIndex: number
  pageSize: number
  state?: VisionAlarmState
  sceneId?: string
  algorithmId?: string
  level?: number
}

export type VisionAlarmAiReviewQuery = TimeRangeQuery & {
  spaceId?: string
}

export interface VisionAlarmSummaryData {
  total: number
  active: number
  handled: number
  activeRate: number
  handledRate: number
  sampleTime: number
  alarmCount: number
  alarmCameraCount: number
}

export interface VisionAlarmLevelDistributionRow {
  level: number
  levelText: string
  count: number
  rate: number
  isHighest: boolean
}

export interface VisionAlarmSceneRankRow {
  rank: number
  sceneId: string
  sceneName: string
  count: number
  rate: number
}

export interface VisionAlarmSceneDistributionRow {
  sceneId: string
  sceneName: string
  count: number
}

export interface VisionAlarmTypeDistributionRow {
  typeId: string
  typeName: string
  count: number
  rate: number
}

export interface VisionAlarmTrendRow {
  timestamp: number
  count: number
}

export interface VisionAlarmLevelTrendRow {
  timestamp: number
  level: number
  levelText: string
  count: number
  total: number
}

export interface VisionAlarmHandlingTrendRow {
  timestamp: number
  activeCount: number
  handledCount: number
  handledRate: number
}

export interface VisionAlarmChannelRankRow {
  rank: number
  channelId: string
  channelName: string
  count: number
  rate: number
}

export interface VisionAlarmAiReviewSummaryData {
  total: number
  valid: number
  filtered: number
  validRate: number
  previousValidRate: number | null
  validRateDelta: number | null
  filterRate: number
  startTime: number
  endTime: number
  sampleTime: number
}

export interface VisionAlarmRecognitionRow {
  label: string | null
  confidence: number | null
  top: number
  left: number
  right: number
  bottom: number
  unit: 'percent' | 'pixel'
}

export interface VisionAlarmListRow {
  alarmId: string
  typeId: string | null
  typeName: string | null
  channelId: string | null
  channelName: string | null
  location: string | null
  level: number | null
  levelText: string | null
  state: VisionAlarmState
  stateText: string
  content: string | null
  alarmTime: number | null
  handleTime: number | null
  imageUrl: string | null
  targetCount: number
  confidence: number | null
  canHandle: boolean
  recognitions: VisionAlarmRecognitionRow[]
}

export interface VisionAlarmPageData {
  data: VisionAlarmListRow[]
  total: number
  pageIndex: number
  pageSize: number
}

export type AlarmEventSource = 'iot' | 'vision'
export type AlarmEventState = 'active' | 'handled'

export type AlarmEventSummaryQuery = Record<string, never>

export type AlarmEventListQuery = TimeRangeQuery & {
  pageIndex: number
  pageSize: number
  state?: AlarmEventState
  level?: number
  source?: AlarmEventSource
}

export interface AlarmEventSummaryData {
  total: number
  totalChangeRate: number | null
  todayCreated: number
  todayCreatedChangeRate: number | null
  active: number
  activeChangeRate: number | null
  handled: number
  handled24h: number
  handled24hChangeRate: number | null
  avgHandleDurationMillis: number | null
  avgHandleDurationChangeRate: number | null
  activeRate: number
  handledRate: number
  sampleTime: number
}

export interface AlarmEventListRow {
  alarmId: string
  source: AlarmEventSource
  categoryId: string
  categoryName: string | null
  deviceId: string | null
  deviceName: string | null
  channelId: string | null
  channelName: string | null
  location: string | null
  level: number | null
  levelText: string | null
  state: AlarmEventState
  stateText: string
  content: string | null
  alarmTime: number | null
  handleTime: number | null
  durationMillis: number | null
}

export interface AlarmEventPageData {
  data: AlarmEventListRow[]
  total: number
  pageIndex: number
  pageSize: number
}
