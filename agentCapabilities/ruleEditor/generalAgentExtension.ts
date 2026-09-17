import { defineAsyncComponent } from 'vue'
import type { GeneralAgentExtension } from '@jetlinks-web-core/layout/components/AiChat/generalAgentExtensions'
import { decodeMarkdownPresentationSource } from '@jetlinks-ai-agent-ui/components/AgentConversation/markdownPresentation'
import {
  RULE_EDITOR_FLOWCHART_EXTENSION_ID,
  RULE_EDITOR_FLOWCHART_PRESENTATION,
  RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE,
} from './constants'

export const ruleEditorFlowchartGeneralAgentExtension: GeneralAgentExtension = {
  id: RULE_EDITOR_FLOWCHART_EXTENSION_ID,
  order: 50,
  conversation: {
    presentationRenderers: [{
      type: RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE,
      renderer: defineAsyncComponent(() => import(
        '@jetlinks-ai-agent-ui/components/AgentConversation/components/MermaidMarkdownBlock.vue'
      )),
      skeleton: defineAsyncComponent(() => import(
        '@jetlinks-ai-agent-ui/components/AgentConversation/components/MermaidMarkdownBlockSkeleton.vue'
      )),
      decode: decodeMarkdownPresentationSource,
      presentation: RULE_EDITOR_FLOWCHART_PRESENTATION,
    }],
  },
}

export default ruleEditorFlowchartGeneralAgentExtension
