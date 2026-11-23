/** 校验声明自身的唯一键与枚举编码，不推断业务类型或改写用户数据。 */
export function inputSchemaIssue(schema?:Record<string,unknown>):string | undefined {
  if (schema?.type === 'enum') {
    const elements = Array.isArray(schema.elements) ? schema.elements : []
    if (!elements.length || elements.some(item=>!['string','number','boolean'].includes(typeof item.value) || item.value === '')) return 'inputChoiceRequired'
    if (new Set(elements.map(item=>`${typeof item.value}:${item.value}`)).size !== elements.length) return 'inputChoiceDuplicate'
  }
  if (schema?.type === 'object' && Array.isArray(schema.properties)) {
    const ids = schema.properties.map(item=>item.id)
    if (ids.some(id=>typeof id !== 'string' || !id.trim())) return 'inputFieldRequired'
    if (new Set(ids).size !== ids.length) return 'inputFieldDuplicate'
    for (const property of schema.properties) { const issue = inputSchemaIssue(property.valueType); if (issue) return issue }
  }
  if (schema?.type === 'array') return inputSchemaIssue(schema.elementType as Record<string,unknown> | undefined)
}
