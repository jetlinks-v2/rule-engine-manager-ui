import i18n from '@jetlinks-web-core/locales'
import { aggregateAiAlarmHistory } from '../api/board'
import type {
  TimeRangeQuery,
  VisionAlarmSummaryData,
} from './visionAlarm.types'

type UnknownRecord = Record<string, unknown>
type VisionAlarmCountSummary = Required<Pick<
  VisionAlarmSummaryData,
  'alarmCount' | 'alarmCameraCount'
>>

const SUMMARY_AGGREGATION_LIMIT = 1
const t = (key: string) => String(i18n.global.t(key))

/** 查询告警触发数量和产生告警的摄像头数量。 */
export async function loadVisionAlarmCountSummary(
  query: TimeRangeQuery,
  signal?: AbortSignal,
): Promise<VisionAlarmCountSummary> {
  const payload: Record<string, unknown> = {
    aggColumns: [
      {
        property: 'id',
        alias: 'alarmCount',
        aggregation: 'COUNT',
        defaultValue: 0,
      },
      {
        property: 'sourceId',
        alias: 'alarmCameraCount',
        aggregation: 'DISTINCT_COUNT',
        defaultValue: 0,
      },
    ],
    limit: SUMMARY_AGGREGATION_LIMIT,
    queryParam: {
      paging: false,
      terms: [],
    },
  }
  if (query.startTime !== undefined) payload.startWithTime = query.startTime
  if (query.endTime !== undefined) payload.endWithTime = query.endTime

  const response = await aggregateAiAlarmHistory(
    payload,
    signal ? { signal, hiddenError: true } : { hiddenError: true },
  )
  const rows = extractRows(response)
  const row = rows[0]
  if (!row) {
    return {
      alarmCount: 0,
      alarmCameraCount: 0,
    }
  }

  return {
    alarmCount: readCount(row.alarmCount),
    alarmCameraCount: readCount(row.alarmCameraCount),
  }
}

function extractRows(response: unknown): UnknownRecord[] {
  const source = asRecord(response)
  if (source.success === false) {
    throw new Error(t('VisionAlarmDataCapability.error.invalidSummaryAggregation'))
  }
  const result = 'result' in source ? source.result : response
  if (Array.isArray(result)) return result.map(asRecord)
  const data = asRecord(result).data
  if (Array.isArray(data)) return data.map(asRecord)
  throw new Error(t('VisionAlarmDataCapability.error.invalidSummaryAggregation'))
}

function readCount(value: unknown): number {
  const count = Number(value)
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(t('VisionAlarmDataCapability.error.invalidSummaryAggregation'))
  }
  return Math.floor(count)
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

