import { metricValueFields, metricValueLabels, metricValueSchema, metricValueUnit, schemaValueLabels, semanticValueText, type ValueTranslate } from './valueSemantics'
import type { MetricCalculatorDescriptor, MetricEvidence, MetricSnapshotValue, MetricTemplate } from './types'
import type { TemplateRule } from './template/designer'
import { algorithmParameter, findCalculator } from './template/algorithm'
import { durationSeconds } from './template/window'
import { metricDurationText } from './presentation'

const evidenceRule = (template:MetricTemplate, outputId?:string) => template.definitions.find(rule=>rule.id === outputId || (rule.windowFamily as {ranges?:{outputs?:{id:string}[]}[]} | undefined)
  ?.ranges?.some(range=>range.outputs?.some(output=>output.id === outputId))) as TemplateRule | undefined

function calculatorParameter(template:MetricTemplate, outputId:string | undefined, id:string, calculators:MetricCalculatorDescriptor[]) {
  const rule=evidenceRule(template,outputId), spec=rule?.calculator
  const declaration=findCalculator(spec,calculators)?.parameterDefinitions.find(item=>item.id === id)
  const parameter=spec && declaration ? algorithmParameter(declaration,spec) : undefined
  const alias=parameter?.expands?.typeFromInput
  return {parameter,inputId:typeof alias === 'string' ? rule?.inputs?.find(item=>item.id === alias)?.metricId : undefined}
}

/** Group only recorded values. Current template metadata supplies labels, never replacement data. */
export function evidenceGroups(evidence:MetricEvidence | undefined, template:MetricTemplate, kind:MetricSnapshotValue['kind'], outputId?:string, calculators:MetricCalculatorDescriptor[] = []) {
  const groups = new Map<string, { id:string; name:string; metricId:string; values:MetricSnapshotValue[]; input?:NonNullable<MetricEvidence['inputs']>[number] }>()
  const add = (id:string) => {
    if (!groups.has(id)) {
      const definition = evidenceRule(template,outputId)
      const binding = (Array.isArray(definition?.inputs) ? definition.inputs as { id:string; metricId:string }[] : []).find(item => item.id === id)
      const metricId = binding?.metricId || template.inputDefinitions.find(item=>item.id === id)?.id
        || evidence?.inputs?.find(item=>item.inputId === id)?.metricId || id
      const declaration = kind === 'calculatorParameter' ? calculatorParameter(template,outputId,id,calculators).parameter : kind === 'parameter' ? template.parameterDefinitions.find(item => item.id === id)
        : template.inputDefinitions.find(item => item.id === metricId) || template.definitions.find(item => item.id === metricId)
      groups.set(id, { id, metricId, name:String(declaration?.name || id), values:[], input:kind === 'input' ? evidence?.inputs?.find(item => item.inputId === id) : undefined })
    }
    return groups.get(id)!
  }
  for (const value of evidence?.execution?.values || []) if (value.kind === kind) add(value.id).values.push(value)
  if (kind === 'input') for (const input of evidence?.inputs || []) add(input.inputId)
  return [...groups.values()]
}

/** Render typed leaves with the existing schema/state/duration semantics; exact large integers remain text. */
export function evidenceValue(value:MetricSnapshotValue, metricId:string, template:MetricTemplate, locale:string, t:ValueTranslate, calculators:MetricCalculatorDescriptor[] = [], outputId?:string) {
  const tokens = value.path.split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
  const duration = tokens[0] === 'state' && tokens[1] === 'duration'
  const inputTime = value.kind === 'input' && tokens.length === 1 && ['inputTimeStart','inputTimeEnd'].includes(tokens[0])
  const path = duration || inputTime ? [] : tokens[0] === 'value' ? tokens.slice(1) : tokens
  const calculator=value.kind === 'calculatorParameter' ? calculatorParameter(template,outputId,value.id,calculators) : undefined
  let schema = calculator ? calculator.parameter?.valueType : value.kind === 'parameter' ? template.parameterDefinitions.find(item => item.id === value.id)?.valueType : metricValueSchema(template,metricId,calculators)
  let unit = duration ? 's' : value.kind === 'input' ? metricValueUnit(template,metricId,calculators) : typeof schema?.unit === 'string' ? schema.unit : undefined
  // MetricValue自身的区间元数据是日期，不能继承业务读数的单位或枚举。
  if (inputTime) { schema={type:'date'}; unit=undefined }
  const names:string[] = []
  for (const key of path) {
    const field = metricValueFields({ [key]:null },schema)[0]
    names.push(field?.name || key)
    schema = field?.schema
    unit = field?.unit
  }
  const label = duration ? t('evidenceStateDuration') : inputTime ? t(tokens[0] === 'inputTimeStart' ? 'evidenceInputTimeStart' : 'evidenceInputTimeEnd') : names.join(' / ')
  if (value.type === 'unavailable') return { label, text:t(`evidenceInput_${value.state}`) }
  if (value.type === 'omitted') return { label, text:t('evidenceOmitted') }
  if (value.type === 'null') return { label, text:t('evidenceNull') }
  // 时长编辑元数据只格式化当次记录值；目录默认值和当前模板参数不补历史。
  if (calculator?.parameter?.expands?.editor === 'duration' && value.type === 'string') {
    const seconds=durationSeconds(value.value || undefined)
    if (seconds !== undefined) return {label,text:metricDurationText(seconds,'s',t)!}
  }
  let scalar:unknown = value.value
  if (value.type === 'boolean') scalar = value.value === 'true'
  if (value.type === 'number') {
    const number = Number(value.value)
    if (Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number))) scalar = number
  }
  const labels = duration || inputTime ? undefined : !path.length && calculator?.inputId ? metricValueLabels(template,calculator.inputId)
    : !path.length && value.kind === 'input' ? metricValueLabels(template,metricId) : schemaValueLabels(schema)
  const text = value.type === 'string' && scalar === '' ? t('evidenceEmptyString') : semanticValueText(scalar,{ labels,unit,locale,schema },t)
  return { label, text:unit && !duration && !['s','ms','min','h'].includes(unit) ? `${text} ${unit}` : text }
}
