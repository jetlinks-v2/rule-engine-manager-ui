import { calculationKind, durationSeconds } from './window'
import { simulationDuration, simulationOperation } from './simulationFlow'
import { expressionLabel, ruleExpression, templateGraphLayout, type TemplateNode, type TemplateRule, type templateGraph } from './designer'
import { ruleFormulaReferences } from './formula'
import { findCalculator } from './algorithm'
import { calculatorIcon } from './calculatorPresentation'
import { aggregationIcon } from './aggregationPresentation'
import { parameterConstraints, parameterTypeKeys } from '../parameterPresentation'
import { metricValueLabels, metricValueSchema, metricValueUnit, schemaValueLabels, type ValueSchema } from '../valueSemantics'
import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import type { MetricCalculatorDescriptor, MetricStateLabel, MetricTemplate, MetricAggregationDescriptor } from '../types'

type Translate = (key: string, values?: Record<string, unknown>) => string
type Graph = ReturnType<typeof templateGraph>
interface NodeSummary { icon: string; text: string; detail: string; detailIcon?:string; method?:string; typeText?:string; preview?:string; choices?:MetricStateLabel[]; description?:string; expression?: string; condition?: string }

/** 画布标签与完整说明共用声明选项，保留编码类型及业务图标。 */
const localizedChoices = (labels:MetricStateLabel[],locale:string) => labels.map(item=>({...item,name:i18nText(item.name,item.nameI18n,locale)}))

/** 类型只来自声明；与属性面板使用同一翻译，单位不代替类型推断。 */
function typeSummary(type:unknown,unit:string | undefined,t:Translate):string {
  const key = typeof type === 'string' ? type : ''
  return [t(key ? key === 'date' ? 'inputDateType' : parameterTypeKeys[key] || 'inputUnknownType' : 'inputUndeclaredType'),unit].filter(Boolean).join(' · ')
}

/** 摘要只读取声明的选项、字段及约束；不采样、不推断值或结果类型。 */
function schemaSummary(schema:ValueSchema | undefined,t:Translate,locale:string):string {
  if (!schema) return ''
  if (schema.type === 'enum' && Array.isArray(schema.elements)) return schema.elements.map(item => {
    const name = i18nText(item.text ?? item.label,item.textI18n,locale)
    return name ? `${name} ${item.value}` : String(item.value)
  }).join(' · ')
  if (schema.type === 'object' && Array.isArray(schema.properties)) return schema.properties.map(item =>
    i18nText(item.name,item.nameI18n,locale) || item.id).join(' · ')
  if (schema.type === 'array') return typeSummary((schema.elementType as ValueSchema | undefined)?.type,undefined,t)
  if (schema.type === 'date') return typeof schema.format === 'string' ? schema.format : ''
  if (['int','long','float','double'].includes(String(schema.type)) && ['min','max','scale'].some(key=>schema[key] !== undefined)) {
    return parameterConstraints({id:'',valueType:schema as {type:string}},t)
  }
  return ''
}

/** 图与编辑选项共用触发语义，不根据显示文案猜测图标。 */
export function ruleTriggerIcon(rule:Pick<TemplateRule,'window'|'temporalCondition'>):string {
  return rule.temporalCondition ? 'FieldTimeOutlined' : rule.window?.emitPolicy === 'onSchedule' ? 'ClockCircleOutlined'
    : rule.window?.emitPolicy === 'onWindowClose' ? 'HistoryOutlined' : 'ThunderboltOutlined'
}

/** 触发频率与取数窗口独立，供图与属性面板共享。 */
export function ruleTriggerSummary(rule:TemplateRule,t:Translate):string {
  return rule.window?.emitPolicy === 'onSchedule' ? t('graphEvery', { duration:simulationDuration(rule.window.emitInterval,t) })
    : rule.window?.emitPolicy === 'onWindowClose' ? t('graphWindowClose') : t('onEvent')
}

/** 图摘要只解释已有配置，不推断时间对齐、采样或计算结果。 */
export function graphNodeSummary(template: MetricTemplate, node: TemplateNode, t: Translate, calculators: MetricCalculatorDescriptor[] = [], locale = 'zh', aggregations:MetricAggregationDescriptor[] = []): NodeSummary {
  if (node.kind === 'input') {
    const input = template.inputDefinitions[node.index]
    return { icon: 'ImportOutlined', text: input.source?.lookback ? `${t('historySeries')} · ${t('recentDuration')} ${simulationDuration(input.source.lookback, t)}` : t('latestReading'),
      detail: input.unit || '',detailIcon:input.source?.lookback ? 'HistoryOutlined' : 'ThunderboltOutlined',
      typeText:typeSummary(input.valueType?.type,input.unit || (typeof input.valueType?.unit === 'string' ? input.valueType.unit : undefined),t),preview:schemaSummary(input.valueType,t,locale),choices:localizedChoices(schemaValueLabels(input.valueType),locale),expression: undefined }
  }
  if (node.kind === 'output') {
    const output = template.outputs[node.index]
    const schema = metricValueSchema(template,output.metricId,calculators)
    const declaredLabels = metricValueLabels(template,output.metricId)
    const labels = localizedChoices(declaredLabels.length ? declaredLabels : schemaValueLabels(schema),locale)
    const source = template.inputDefinitions.find(item=>item.id === output.metricId) || template.definitions.find(item=>item.id === output.metricId) as TemplateRule | undefined
    const preview = labels.length ? labels.map(item=>`${item.name} ${item.value}`).join(' · ')
      : schemaSummary(schema,t,locale) || (source ? `${t('outputFrom')} ${source.name || source.id}` : '')
    return { icon: 'ExportOutlined', text: output.unit || '', detail: t('output'),detailIcon:'ExportOutlined',
      typeText:typeSummary(output.valueType || schema?.type,output.unit || metricValueUnit(template,output.metricId,calculators),t),preview,choices:labels,expression: undefined }
  }
  const rule = template.definitions[node.index] as TemplateRule
  const kind = calculationKind(rule)
  const names = new Map(ruleFormulaReferences(template, rule, calculators).map(item => [item.expression, item.label]))
  const conditionSource=ruleExpression(rule,'applicabilityExpression'),source=ruleExpression(rule)
  const condition = conditionSource ? expressionLabel(template, conditionSource, names) : undefined
  const timing = ruleTriggerSummary(rule,t)
  const detailIcon = ruleTriggerIcon(rule)
  if (rule.temporalCondition) return { icon: 'ClockCircleOutlined', method:t('temporal'), expression: ruleExpression(rule,'enterExpression'), condition,detailIcon,
    text: expressionLabel(template, ruleExpression(rule,'enterExpression'), names) || t('temporal'), detail: t('graphDwellRecovery', { dwell: simulationDuration(rule.temporalCondition.dwell, t), recovery: simulationDuration(rule.temporalCondition.recovery, t) }) }
  if (rule.calculator) {
    const descriptor=findCalculator(rule.calculator,calculators),operation=simulationOperation(rule,t)
    return {icon:calculatorIcon(descriptor),method:descriptor?.name || t('calculator'),expression:undefined,condition,
      text:descriptor?.name || expressionLabel(template,operation,names),detail:timing,detailIcon,
      description:operation !== rule.calculator.provider ? expressionLabel(template,operation,names) : descriptor?.description}
  }
  return { icon: kind === 'statistics' ? aggregationIcon(rule.timeAggregation || rule.aggregation,aggregations) : 'FunctionOutlined', method:t(kind === 'statistics' ? 'statistics' : 'expression'), expression: source, condition,detailIcon,
    text: kind === 'statistics' ? simulationOperation(rule, t,aggregations) : expressionLabel(template, source, names) || t('expression'),
    detail: kind === 'statistics' && source ? `${simulationOperation(rule, t,aggregations)} · ${timing}` : timing }
}

/** 只合并相邻、同层且统计时间口径一致的节点；分组不成为执行容器。 */
export function graphTimeGroups(template: MetricTemplate, graph: Graph, t: Translate) {
  const groups: { key: string; label: string; x: number; y: number; width: number }[] = []
  let run: Graph['nodes'] = []
  let previous = ''
  const flush = () => {
    if (run.length > 1) {
      const first = run[0]; const last = run[run.length - 1]
      const rule = template.definitions[first.index] as TemplateRule
      groups.push({ key: first.key, label: rule.window?.mode === 'time'
        ? `${t('recentDuration')} ${simulationDuration(rule.window.size, t)}`
        : `${t('recentDuration')} ${rule.window?.size} ${t('readings')}`, x: first.x - 6, y: first.y - 20, width: last.x - first.x + templateGraphLayout.nodeWidth + 12 })
    }
    run = []
  }
  for (const node of graph.nodes) {
    const rule = node.kind === 'rule' ? template.definitions[node.index] as TemplateRule : undefined
    const window = rule?.window
    const key = rule && !rule.windowFamily && (rule.aggregation || rule.timeAggregation) && (window?.mode === 'time' || window?.mode === 'latestN')
      ? JSON.stringify([node.level, window.mode, window.mode === 'time' ? durationSeconds(window.size) ?? window.size : window.size,
        window.timeMode || 'processing', window.emitPolicy || 'onEvent', window.emitInterval, window.step, window.allowedLateness]) : ''
    if (!key || key !== previous) flush()
    if (key) run.push(node)
    previous = key
  }
  flush()
  return groups
}
