import type { GeneralAgentExtension } from '@jetlinks-web-core/layout/components/AiChat/generalAgentExtensions'
import {
  RULE_EDITOR_FLOWCHART_EXTENSION_ID,
  RULE_EDITOR_FLOWCHART_PRESENTATION,
  RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE,
} from './constants'

export const ruleEditorFlowchartGeneralAgentExtension: GeneralAgentExtension = {
  id: RULE_EDITOR_FLOWCHART_EXTENSION_ID,
  order: 50,
  conversation: {
    presentationAliases: [{
      type: RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE,
      rendererType: 'mermaid',
      presentation: RULE_EDITOR_FLOWCHART_PRESENTATION,
    }],
  },
}

export default ruleEditorFlowchartGeneralAgentExtension
