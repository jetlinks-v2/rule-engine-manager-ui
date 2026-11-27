export type TemplateCategory = 'data-forwarding' | 'data-preparation' | 'data-query' | 'device-actions' | 'anomaly-notifications' | 'examples'
export type TemplateId = 'blank' | 'device-forward' | 'device-summary' | 'device-normalize' | 'transform-response' | 'parallel-response' | 'device-query' | 'device-query-all' | 'scheduled-read' | 'event-action' | 'threshold-notify' | 'manual-transform'
export type Translate = (key: string, values?: Record<string, string | number>) => string
export interface ModelValueType {
  type?: string
  unit?: string
  elements?: { value: unknown; text?: string }[]
  properties?: ModelDefinition[]
  elementType?: ModelValueType
  [key: string]: unknown
}
export interface ModelDefinition {
  id: string
  name?: string
  nameI18n?: Record<string, string>
  description?: string
  valueType?: ModelValueType
  outputs?: ModelValueType | ModelDefinition[]
  inputs?: ModelDefinition[]
  expands?: { type?: string[] }
}
export interface ThingModel { properties: ModelDefinition[]; events: ModelDefinition[]; functions: ModelDefinition[] }
export interface ResourceOption { id: string; name: string; productId?: string }
export interface DeviceSource {
  product: ResourceOption
  scope: 'product' | 'devices'
  devices: ResourceOption[]
  message: 'property' | 'event'
  properties: ModelDefinition[]
  event?: ModelDefinition
  eventFields: ModelDefinition[]
  format: 'message' | 'fields' | 'records'
  includeMetadata: boolean
}
export interface TemplateParameters {
  source?: DeviceSource
  target: 'http request' | 'mqtt out' | 'kafka-producer'
  url: string
  topic: string
  cron: string
  window: '1m' | '5m' | '15m' | '1h'
  aggregate: 'avg' | 'sum' | 'min' | 'max'
  comparison: '>' | '>=' | '<' | '<='
  threshold?: number
}
export interface RuleTemplate {
  id: TemplateId
  category?: TemplateCategory
  icon: string
  nodes: string[]
  setup?: 'device-source' | 'schedule'
  steps: string[]
}
export interface FlowNode {
  id: string
  type: string
  name: string
  x: number
  y: number
  wires: string[][]
  [key: string]: unknown
}
export interface TemplateInitialization {
  templateId: TemplateId
  focusNodeId?: string
  pending: { nodeId: string; label: string }[]
  source?: DeviceSource
}
export interface TemplateDraft {
  payload: { name: string; description: string; modelMeta: string; metadata: { icon: string; thumbnailSvg?: string } }
  initialization: TemplateInitialization
}
export interface TemplateCreationRequest { templateId:TemplateId; parameters?:Record<string,unknown>; userGoal?:string }
export const defaultTemplateParameters = (): TemplateParameters => ({
  target: 'http request', url: '', topic: '', cron: '0 */5 * * * ?', window: '5m', aggregate: 'avg', comparison: '>',
})
