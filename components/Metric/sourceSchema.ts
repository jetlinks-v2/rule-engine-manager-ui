import { copy } from './service'
import type { MetricInputSemantics, MetricTemplateInput } from './types'

/** 与后端 MetricInputSemantics 相同，只匹配来源显式声明，不推测名称或同义词。 */
export function metricSourceMatchesSemantics(required:MetricInputSemantics | undefined, metadata:Record<string,unknown> = {}):boolean {
  if (!required) return true
  const types = Array.isArray(metadata.semanticTypes) ? metadata.semanticTypes : []
  return (!required.semanticId || required.semanticId === metadata.semanticId)
    && (!required.semanticRole || required.semanticRole === metadata.semanticRole)
    && (required.semanticTypes || []).every(type=>types.includes(type))
}

const numericTypes = new Set(['byte','short','int','long','bigint','float','double','number','integer','decimal'])
const unitText = (value:unknown) => typeof value === 'string' ? value.normalize('NFKC') : undefined
/** 平台枚举编码序列化为字符串，按其显式编码类型比较，不把普通文本编码当作数值。 */
function enumCode(schema:Record<string,unknown>, value:unknown):unknown {
  const type = (schema.valueType as Record<string,unknown> | undefined)?.type
  if (numericTypes.has(String(type)) && typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  if (type === 'boolean' && (value === 'true' || value === 'false')) return value === 'true'
  return value
}
/** 仅按声明类型筛选；数值类型可参与同一算式，未知类型不按名称推断兼容性。 */
export function metricSourceMatchesType(required:Record<string,unknown> | undefined, actual:Record<string,unknown> | undefined):boolean {
  if (!required?.type) return true
  if (!actual?.type) return false
  if (required.unit && unitText(required.unit) !== unitText(actual.unit)) return false
  if (required.type === 'object' && actual.type === 'object') {
    const fields = new Map((Array.isArray(actual.properties) ? actual.properties : []).map(field=>[field.id,field.valueType]))
    return (Array.isArray(required.properties) ? required.properties : []).every(field=>fields.has(field.id) && metricSourceMatchesType(field.valueType,fields.get(field.id)))
  }
  if (required.type === 'array' && actual.type === 'array') return metricSourceMatchesType(required.elementType as Record<string,unknown> | undefined,actual.elementType as Record<string,unknown> | undefined)
  if (required.type === 'enum' && actual.type === 'enum' && Array.isArray(required.elements) && required.elements.length) {
    return Array.isArray(actual.elements) && actual.elements.length > 0 && actual.elements.every(item=>(required.elements as {value:unknown}[]).some(option=>enumCode(required,option.value) === enumCode(actual,item.value)))
  }
  return required.type === actual.type || numericTypes.has(String(required.type)) && numericTypes.has(String(actual.type))
    || actual.type === 'enum' && Array.isArray(actual.elements) && actual.elements.length > 0
      && actual.elements.every(item=>numericTypes.has(String(required.type)) ? typeof enumCode(actual,item.value) === 'number' : typeof enumCode(actual,item.value) === required.type)
}

/** 语义使用开放词汇，只复制来源显式声明的输入约束。 */
export function metricSourceSemantics(metadata:Record<string,unknown> = {}):MetricInputSemantics | undefined {
  const semantics:MetricInputSemantics = {
    ...(typeof metadata.semanticId === 'string' && metadata.semanticId ? {semanticId:metadata.semanticId} : {}),
    ...(typeof metadata.semanticRole === 'string' && metadata.semanticRole ? {semanticRole:metadata.semanticRole} : {}),
    ...(Array.isArray(metadata.semanticTypes) && metadata.semanticTypes.length ? {semanticTypes:metadata.semanticTypes.filter((item):item is string=>typeof item === 'string')} : {}),
  }
  return semantics.semanticId || semantics.semanticRole || semantics.semanticTypes?.length ? semantics : undefined
}
export function metricSourceHasInputConstraint(input:MetricTemplateInput):boolean {
  return !!(input.valueType?.type || input.semantics?.semanticId || input.semantics?.semanticRole || input.semantics?.semanticTypes?.length)
}
/** 声明了类型和语义时两者都须匹配；没有任何约束时不把整个目录当作兼容来源。 */
export function metricSourceMatchesInput(input:MetricTemplateInput, source:{valueType?:Record<string,unknown>;unit?:string;expands?:Record<string,unknown>}):boolean {
  const requiredUnit = input.unit || input.valueType?.unit
  const actualUnit = source.unit || source.valueType?.unit
  return metricSourceHasInputConstraint(input) && metricSourceMatchesType(input.valueType,source.valueType)
    && metricSourceMatchesSemantics(input.semantics,source.expands)
    && (!requiredUnit || unitText(requiredUnit) === unitText(actualUnit) || unitText(requiredUnit) === unitText(source.valueType?.unit))
}

/** 来源目录使用 JSON Schema，编辑器使用平台 valueType；只按声明转换，不猜业务字段含义。 */
export function metricSourceSchema(schema:Record<string,unknown>):Record<string,unknown> {
  // JSON Schema 的 x- 扩展来自通用元数据映射器；转换后仍由原字段声明语义。
  const extensions = Object.fromEntries(Object.entries(schema).filter(([key])=>key.startsWith('x-')).map(([key,value])=>[key.slice(2),value]))
  schema = {...schema,...(Object.keys(extensions).length ? {expands:{...extensions,...schema.expands as Record<string,unknown>}} : {}),
    ...(typeof schema['x-unit'] === 'string' ? {unit:schema['x-unit']} : {})}
  if (Array.isArray(schema.properties) || Array.isArray(schema.elements) || schema.elementType) return copy(schema)
  if (Array.isArray(schema.enum)) return { ...schema,type:'enum',valueType:{type:schema.type === 'integer' ? 'long' : schema.type === 'number' ? 'double' : schema.type},elements:schema.enum.map((value,index)=>({value,text:Array.isArray(schema.enumNames) ? schema.enumNames[index] : String(value)})) }
  const type = schema.type === 'integer' ? 'long' : schema.type === 'number' ? 'double'
    : schema.type === 'string' && ['date','date-time'].includes(String(schema.format)) ? 'date' : schema.type
  if (type === 'object') return { ...schema,type,properties:Object.entries(schema.properties || {}).map(([id,field])=>{const valueType=metricSourceSchema(field as Record<string,unknown>);return {id,name:(field as Record<string,unknown>).title || id,expands:valueType.expands,valueType}}) }
  if (type === 'array') return { ...schema,type,elementType:metricSourceSchema((schema.items || {}) as Record<string,unknown>) }
  return { ...schema,type }
}
export function metricSourceField(schema:Record<string,unknown>,path:string):Record<string,unknown> | undefined {
  if (path === '$') return schema
  let field:Record<string,unknown> | undefined = schema
  for (const id of path.split('.')) field = Array.isArray(field?.properties) ? field.properties.find(item=>item.id === id)?.valueType : undefined
  return field
}
