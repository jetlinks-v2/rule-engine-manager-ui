import {
  createDomainAgentRecordSetCardinality,
  createDomainAgentToolResult,
  resolveDomainAgentTimeRange,
} from '@jetlinks-web-core/layout/components/AiChat/domainAgentTools'
import {
  queryAlarmNoiseStatsByTimestampRange,
} from './alarmData.service'
import type { AlarmNoiseStats, EventSelection } from './alarmData.types'
import {
  inputError,
  normalizeText,
  runAlarmTool,
  sourceValue,
} from './alarmAnalysis.shared'

export const alarmNoiseService = {
  getNoiseSummary: (args: Record<string, unknown>) => runAlarmTool<AlarmNoiseStats>({
    total: 0,
    valid: 0,
    filtered: 0,
    filterRate: 0,
    validRate: 0,
  }, async () => {
    const range = resolveDomainAgentTimeRange(args)
    const sceneId = normalizeText(args.sceneId)
    const spaceId = normalizeText(args.spaceId)
    if (sceneId && spaceId) {
      throw inputError('ALARM_NOISE_FILTER_CONFLICT', 'noiseFilterConflict')
    }
    const selection: EventSelection | undefined = sceneId
      ? { dim: 'scene', value: sceneId, sub: null }
      : spaceId
        ? { dim: 'region', value: spaceId, sub: null }
        : undefined
    const data = await queryAlarmNoiseStatsByTimestampRange([range.start, range.end], selection)
    return createDomainAgentToolResult({
      domain: 'alarm',
      timeRange: range,
      filters: { source: 'vision', sceneId: sceneId || undefined, spaceId: spaceId || undefined },
      summary: { source: sourceValue('vision'), ...data },
      data,
      total: data.total,
      cardinality: createDomainAgentRecordSetCardinality({ returnedCount: data.total }),
      supportsAbsenceClaim: data.total === 0,
    })
  }),
}
