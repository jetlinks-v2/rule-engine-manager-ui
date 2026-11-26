/** 与名称反显共用词法边界，字符串常量不被识别为变量引用。 */
export const expressionTokens = /#sample\.getTags\(\)\[['"]parameters['"]\]\[['"]([^'"]+)['"]\]|#?params(?:\.([a-zA-Z_][\w]*)|\['((?:[^']|'')*)'\])|'(?:[^']|'')*'|"(?:[^"]|"")*"|#?[a-zA-Z_][\w]*/g

export function expressionParameters(expression:string):Set<string> {
  const parameters = new Set<string>()
  for (const match of expression.matchAll(expressionTokens)) {
    const id = match[1] ?? match[2] ?? match[3]?.replaceAll("''", "'")
    if (id !== undefined && expression[(match.index || 0) - 1] !== '.') parameters.add(id)
  }
  return parameters
}
