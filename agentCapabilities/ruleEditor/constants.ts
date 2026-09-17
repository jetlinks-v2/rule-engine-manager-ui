import {
  TOPOLOGY_DIAGRAM_MEDIA_TYPE,
  TOPOLOGY_DIAGRAM_SHAPE,
} from '../../views/Instance/RuleEditor/toolRuntimeContracts'

export const RULE_EDITOR_FLOWCHART_EXTENSION_KEY = 'rule-engine/rule-editor-flowchart'
export const RULE_EDITOR_FLOWCHART_EXTENSION_ID = 'rule-engine:rule-editor-flowchart'
export const RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE = 'flowchart'
export const RULE_EDITOR_FLOWCHART_MENU_ANCHORS = [
  'rule-engine/Instance',
  '/rule-engine/Instance',
] as const

export const RULE_EDITOR_FLOWCHART_PRESENTATION = {
  contentType: 'text' as const,
  mediaType: TOPOLOGY_DIAGRAM_MEDIA_TYPE,
  supportsSessionFile: true,
  maxInlineBytes: 32 * 1024,
  defaultMode: 'preview' as const,
  purpose: 'conversation-preview' as const,
  preferredInputShapes: [TOPOLOGY_DIAGRAM_SHAPE],
  deliveryPolicy: 'explicit' as const,
  contentResponsibilities: ['topology', 'process.flow'],
  narrativePolicy: {
    mode: 'card-first' as const,
    allowedTextRoles: ['summary', 'next_step'],
  },
}
