import type { MetricStateLabel, MetricTemplate, MetricTemplateOutput } from './types'
import { isStateOutput, stateLabels, tracksStateIntervals } from './stateIntervals'

export type MetricOutputHistory = 'interval' | 'state' | 'boolean' | 'number' | 'records' | 'auto'
interface OutputPresentation { icon:string; history:MetricOutputHistory }
interface OutputContext { template?:MetricTemplate; labels?:MetricStateLabel[] }
const numericIcons:Record<string,string> = { score:'DashboardOutlined',ratio:'PercentageOutlined',duration:'ClockCircleOutlined',quantity:'NumberOutlined',numeric:'LineChartOutlined' }

/** Menus and history share declared semantics; scalar enum codes never become numeric trends. */
export function metricOutputPresentation(output?:MetricTemplateOutput, context:OutputContext = {}):OutputPresentation {
  const rule = context.template?.definitions.find(item => item.id === output?.metricId)
  if (output && tracksStateIntervals(context.template,output.metricId)) return { icon:'FieldTimeOutlined',history:'interval' }
  const labels = context.labels ?? (output ? stateLabels(context.template,output.metricId) : [])
  if (isStateOutput(output,labels)) return { icon:'SwitcherOutlined',history:'state' }
  if (output?.valueType === 'boolean' || rule?.temporalCondition) return { icon:'CheckSquareOutlined',history:'boolean' }
  const semantic = output?.options?.readAggregation?.semantic ?? output?.metricKind
  if (semantic && numericIcons[semantic]) return { icon:numericIcons[semantic],history:'number' }
  if (['string','text'].includes(output?.valueType || '')) return { icon:'FontSizeOutlined',history:'records' }
  if (['object','array','date'].includes(output?.valueType || '')) return { icon:'ProfileOutlined',history:'records' }
  if (['s','min','h'].includes(output?.unit || '')) return { icon:'ClockCircleOutlined',history:'number' }
  if (output?.unit === '%') return { icon:'PercentageOutlined',history:'number' }
  if (['int','long','float','double','number','decimal'].includes(output?.valueType || '')) return { icon:'LineChartOutlined',history:'number' }
  return { icon:'FileUnknownOutlined',history:'auto' }
}
