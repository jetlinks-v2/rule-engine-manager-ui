import { parse, stringify } from 'yaml'
export type ConfigurationFormat = 'yaml' | 'json'
export function encodeConfiguration(value: unknown, format: ConfigurationFormat): string {
  return format === 'yaml' ? stringify(value) : JSON.stringify(value, null, 2)
}
export function decodeConfiguration(text: string, format: ConfigurationFormat): unknown {
  return format === 'yaml' ? parse(text) : JSON.parse(text)
}
/** 管理员文本编辑转换到唯一 DTO；规则语义由后端编译器检查。 */
export function configurationObject(text: string, format: ConfigurationFormat, invalidObjectMessage = 'Configuration must be an object'): Record<string, unknown> {
  const value = decodeConfiguration(text, format)
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(invalidObjectMessage)
  return value as Record<string, unknown>
}

/** 只用于编辑态比较：对象键顺序无关，空值字面量允许服务端省略 value:null；保存仍用原对象。 */
export function configurationSnapshot(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    return Object.fromEntries(Object.keys(item).sort().filter(key => !(key === 'value'
      && item.type === 'literal' && item.valueType === 'null' && item.value == null)).map(key => [key, item[key]]))
  })
}
