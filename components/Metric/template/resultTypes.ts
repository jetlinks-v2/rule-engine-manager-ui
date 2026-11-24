import type { ExpressionFunction, ExpressionNode } from '@jetlinks-web-core/components/Expression/types'
import type { MetricCalculatorDescriptor, MetricTemplate } from '../types'
import type { TemplateRule } from './designer'
import { findCalculator } from '../calculatorDescriptor'

export type ResultSchema = Record<string, unknown>
export interface ResultTypeResolution { schema?:ResultSchema; inferred?:ResultSchema; issue?:'conflict'|'unknown'|'incompatible'; declared:boolean }
const numeric = ['byte','short','int','long','bigint','float','double','decimal','number']
const object = (value:unknown):ResultSchema | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as ResultSchema : undefined
const type = (id:string):ResultSchema => ({type:id})
function scalar(schema:ResultSchema):ResultSchema {
  if (schema.type !== 'enum') return schema
  const underlying=object(schema.valueType)
  if (underlying) return underlying
  const value=(schema.elements as {value:unknown}[] | undefined)?.[0]?.value
  return type(typeof value === 'number' ? 'double' : typeof value === 'boolean' ? 'boolean' : 'string')
}
const numericType = (schema:ResultSchema) => numeric.includes(String(scalar(schema).type))
type Family={ranges?:{outputs?:{id:string;aggregation?:string;timeAggregation?:string}[]}[]}
const familyOutput=(rule:TemplateRule,id:string)=>(rule.windowFamily as Family | undefined)?.ranges?.flatMap(range=>range.outputs || []).find(output=>output.id === id)
function aggregated(source:ResultSchema | undefined,aggregation?:string,timeAggregation?:string):ResultSchema | undefined {
  if (timeAggregation) return source && numericType(source) ? type('double') : undefined
  if (!aggregation) return source
  if (['count','distinctCount'].includes(aggregation)) return type('long')
  if (['first','last','min','max'].includes(aggregation)) return source
  return source && numericType(source) ? type('double') : undefined
}

/** 合并声明而非样本；null 不改变非空分支类型，业务枚举/日期不从数字猜测。 */
export function mergeResultTypes(left?:ResultSchema,right?:ResultSchema):ResultSchema | undefined {
  if (!left || !right) return undefined
  if (left.type === 'null') return right
  if (right.type === 'null') return left
  if (JSON.stringify(left) === JSON.stringify(right)) return left
  if (numericType(left) && numericType(right)) return type(numeric[Math.max(numeric.indexOf(String(scalar(left).type)),numeric.indexOf(String(scalar(right).type)))])
  if (left.type !== right.type) return undefined
  if (left.type === 'enum') return undefined
  if (left.type === 'array') {
    const elementType=mergeResultTypes(object(left.elementType),object(right.elementType))
    return elementType ? {type:'array',elementType} : type('array')
  }
  if (left.type === 'object') return undefined
  return type(String(left.type))
}

export function resultTypeCompatible(actual:ResultSchema,declared:ResultSchema):boolean {
  if (actual.type === 'null') return true
  if (actual.type === declared.type) return true
  if (numericType(actual) && numericType(declared)) return true
  if (declared.type === 'enum') return ['string','boolean'].includes(String(scalar(actual).type)) || numericType(actual)
  return declared.type === 'date' && (numericType(actual) || actual.type === 'string')
}

/** 编辑期的静态投影；后端仍拥有发布与结果校验，不执行表达式或根据试算猜类型。 */
export function resolveMetricResultType(template:MetricTemplate,id:string,calculators:MetricCalculatorDescriptor[]=[],functions:ExpressionFunction[]=[],visiting=new Set<string>()):ResultTypeResolution {
  if (visiting.has(id)) return {declared:false,issue:'unknown'}
  const input=template.inputDefinitions.find(item=>item.id === id)
  if (input) return {schema:input.valueType && {...input.valueType,...(input.unit ? {unit:input.unit} : {})},declared:true}
  const rule=template.definitions.find(item=>item.id === id || familyOutput(item as TemplateRule,id)) as TemplateRule | undefined
  if (!rule) return {declared:false,issue:'unknown'}
  const seen=new Set(visiting).add(id)
  const resolve=(metricId:string)=>resolveMetricResultType(template,metricId,calculators,functions,seen).schema
  const field=(schema:ResultSchema | undefined,path:string[]):ResultSchema | undefined=>path.reduce<ResultSchema | undefined>((value,key)=>{
    if (value?.type === 'array' && /^\d+$/.test(key)) return object(value.elementType)
    return (value?.properties as {id:string;valueType:ResultSchema}[] | undefined)?.find(item=>item.id === key)?.valueType
  },schema)
  function expression(node:ExpressionNode):ResultSchema | undefined {
    if (node.type === 'literal') return type(node.valueType)
    if (node.type === 'reference') {
      if (node.id === 'params') return field(template.parameterDefinitions.find(item=>item.id === node.path[0])?.valueType,node.path.slice(1))
      if (node.id === 'sample' && node.path.join('.') === 'processTime') return type('date')
      if (node.id === 'metricValues') return node.path.slice(1).join('.') === 'state.duration' ? {type:'double',unit:'s'} : ['inputTimeStart','inputTimeEnd'].includes(node.path[1]) ? type('date') : undefined
      const alias=(id:string)=>id.replace(/[^a-zA-Z0-9_]/g,'_')
      const binding=rule!.inputs?.find(item=>item.id && alias(item.id) === node.id && !item.source)
      const original=[...template.inputDefinitions,...template.definitions].find(item=>typeof item.id === 'string' && alias(item.id) === node.id)?.id
      return field(resolve(String(binding?.metricId || original || node.id)),node.path)
    }
    if (node.type === 'logical') return type('boolean')
    if (node.type === 'unary') {
      const operand=expression(node.operand)
      return node.operator === 'not' ? type('boolean') : operand && type(String(scalar(operand).type))
    }
    if (node.type === 'conditional') return mergeResultTypes(expression(node.whenTrue),expression(node.whenFalse))
    if (node.type === 'binary') {
      if (['eq','ne','lt','le','gt','ge','in','notIn'].includes(node.operator)) return type('boolean')
      const left=expression(node.left),right=expression(node.right)
      if (!left || !right) return undefined
      if (node.operator === 'add' && (left.type === 'string' || right.type === 'string')) return type('string')
      const combined=numericType(left) && numericType(right) ? mergeResultTypes(scalar(left),scalar(right)) : undefined
      return combined && type(String(combined.type))
    }
    const returns=functions.find(item=>item.id === node.function)?.returnType
    return returns && returns !== 'any' ? type(returns) : undefined
  }
  let inferred:ResultSchema | undefined
  const output=familyOutput(rule,id)
  if (output) inferred=aggregated(resolve(rule.sourceMetric || rule.inputs?.[0]?.metricId || rule.dependsOn?.[0] || ''),output.aggregation || 'last',output.timeAggregation)
  else if (rule.calculator) {
    const spec=rule.calculator
    inferred=spec.outputType || findCalculator(spec,calculators)?.configuration.outputType
    if (inferred && spec.outputUnit) inferred={...inferred,unit:spec.outputUnit}
  } else if (rule.temporalCondition) inferred=type('boolean')
  else if (rule.expressionTree) inferred=expression(rule.expressionTree.root)
  else if (!rule.expression?.trim()) {
    const source=resolve(rule.sourceMetric || rule.inputs?.[0]?.metricId || rule.dependsOn?.[0] || '')
    inferred=aggregated(source,rule.aggregation,typeof rule.timeAggregation === 'string' ? rule.timeAggregation : undefined)
  }
  const declared=object(rule.resultType)
  const issue=declared && inferred && !resultTypeCompatible(inferred,declared) ? 'incompatible'
    : !inferred && !declared ? rule.expressionTree?.root.type === 'conditional' ? 'conflict' : 'unknown' : undefined
  return {schema:declared || inferred,inferred,declared:!!declared,issue}
}
