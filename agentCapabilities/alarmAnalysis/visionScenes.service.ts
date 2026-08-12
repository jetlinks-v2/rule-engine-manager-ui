import {
  createDomainAgentRecordSetCardinality,
  createDomainAgentToolResult,
  resolveDomainAgentInteger,
} from '@jetlinks-web-core/layout/components/AiChat/domainAgentTools'
import { querySceneTreeData } from './alarmData.service'
import { normalizeText, runAlarmTool } from './alarmAnalysis.shared'
import {
  normalizeVisionAlarmScenes,
  searchVisionAlarmScenes,
  type VisionAlarmScene,
} from './visionSceneSearch'

export const visionScenesService = {
  search: (args: Record<string, unknown>) => runAlarmTool<VisionAlarmScene[]>([], async () => {
    const query = normalizeText(args.query)
    const limit = resolveDomainAgentInteger(args.limit, {
      name: 'limit',
      defaultValue: 10,
      min: 1,
      max: 20,
    })
    const availableScenes = normalizeVisionAlarmScenes(await querySceneTreeData())
    const matchedScenes = searchVisionAlarmScenes(availableScenes, query)
    const data = matchedScenes.slice(0, limit)
    return createDomainAgentToolResult({
      domain: 'alarm',
      status: data.length ? undefined : 'empty',
      filters: { query: query || undefined },
      summary: {
        available: availableScenes.length,
        matched: matchedScenes.length,
        returned: data.length,
      },
      data,
      total: matchedScenes.length,
      cardinality: createDomainAgentRecordSetCardinality({
        returnedCount: data.length,
        totalCount: matchedScenes.length,
      }),
      truncated: matchedScenes.length > data.length,
    })
  }),
}
