import type { GeneralAgentExtension } from '@jetlinks-web-core/layout/components/AiChat/generalAgentExtensions'
import { ALARM_ANALYSIS_PROVIDER_ID } from './constants'
import { alarmAnalysisGeneralAgentProvider } from './generalAgentProvider'

export const alarmAnalysisGeneralAgentExtension: GeneralAgentExtension = {
  id: ALARM_ANALYSIS_PROVIDER_ID,
  order: 40,
  provider: alarmAnalysisGeneralAgentProvider,
}

export default alarmAnalysisGeneralAgentExtension
