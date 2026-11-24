import type { MetricCalculatorDescriptor, MetricTemplate } from '../types'
import type { TemplateRule } from './designer'
import { metricValueSchema,metricValueLabels } from '../valueSemantics'
import type {ExpressionNode,StructuredExpression} from '@jetlinks-web-core/components/Expression/types'
import { findCalculator } from '../calculatorDescriptor'
import { metricMessages } from '../messages'
import type { ExpressionReference } from '@jetlinks-web-core/components/Expression/editor'

/** 编辑与反显共用引用身份、说明和类型。 */
export function templateExpressionReferences(references:FormulaReference[],locale:string):ExpressionReference[] {
  const messages=metricMessages[locale.startsWith('en') ? 'en' : 'zh']
  return references.map(item=>({...formulaReferencePath(item),label:item.label,displayLabel:item.displayLabel,schema:item.schema,unit:item.unit,icon:item.group === 'parameter' ? 'SlidersOutlined' : 'DatabaseOutlined',group:messages[item.group === 'parameter' ? 'formulaParameters' : 'formulaData']}))
}

/** Visual arithmetic and comparison expressions share one AST; other SpEL stays in advanced mode. */
export interface FormulaReference { key: string; label: string; displayLabel?:string; expression: string; referenceId?:string; metricId?: string; group?: 'data' | 'parameter'; semantic?: 'stateDuration'; path?:string[]; schema?:Record<string,unknown>; unit?:string }
export const formulaFunctions = ['abs', 'min', 'max', 'round', 'sqrt'] as const
/** 原位放大使用浏览器 top layer，浮层必须留在同一 dialog 中。 */
export function formulaPopupContainer(trigger:HTMLElement):HTMLElement {return trigger.closest('dialog') || trigger.parentElement!}
type FunctionName = typeof formulaFunctions[number]
export type FormulaNode = { kind: 'number'; value: string } | { kind: 'reference'; reference: FormulaReference }
  | { kind: 'literal'; value: string | boolean | null }
  | { kind: 'conditional'; condition: FormulaNode; yes: FormulaNode; no: FormulaNode }
  | { kind: 'unary'; operator: string; value: FormulaNode }
  | { kind: 'binary'; operator: string; left: FormulaNode; right: FormulaNode }
  | { kind: 'function'; name: FunctionName; args: FormulaNode[] }
type Node = FormulaNode
type Token = string | Node
const precedence: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6 }
const latexOperators: Record<string, string> = { '*': '\\times ', '||': '\\lor ', '&&': '\\land ', '==': '=', '!=': '\\ne ', '<=': '\\le ', '>=': '\\ge ' }
const conditionCommands: Record<string, string> = { le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=', lt: '<', gt: '>', land: '&&', wedge: '&&', lor: '||', vee: '||', lnot: '!', neg: '!' }

export function ruleDataReferences(template: MetricTemplate, rule: TemplateRule) {
  return [
    ...template.inputDefinitions.map(item => ({ id: item.id, label: item.name || item.id })),
    // 执行按依赖排序；序列化顺序不限制已有前向引用的名称和对象字段解析。
    ...template.definitions.filter(item => item.id !== rule.id).map(item => ({ id: String(item.id), label: template.outputs.find(output => output.metricId === item.id)?.label || (item as TemplateRule).name || String(item.id) })),
  ]
}

const dataAlias = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_')

/** 输入说明与公式候选共用声明投影；别名仅改变访问路径，不改变字段与类型。 */
export function dataFormulaReferences(template: MetricTemplate, item: { id:string; label:string }, calculators: MetricCalculatorDescriptor[] = [], locale = 'zh', alias = item.id): FormulaReference[] {
  const system = (zh:string,en:string) => locale.startsWith('en') ? en : zh
  function fields(type: Record<string, unknown> | undefined, metricId: string, label: string, expression: string, fallback?: Record<string, unknown>, keys:string[] = []): FormulaReference[] {
    if (type?.type !== 'object' || !Array.isArray(type.properties)) return []
    return type.properties.flatMap(property => {
      const defaults = Array.isArray(fallback?.properties) ? fallback.properties.find(item => item.id === property.id) : undefined
      const name = `${label} · ${property.name || defaults?.name || property.id}`
      const path = `${expression}['${String(property.id).replaceAll("'", "''")}']`
      const nested = [...keys,String(property.id)]
      return [{ key: `${metricId}:${path}`, expression: path, label: name, displayLabel:property.name || defaults?.name || property.id, metricId, group: 'data' as const, path:nested, schema:property.valueType,unit:property.valueType?.unit }, ...fields(property.valueType, metricId, name, path, defaults?.valueType,nested)]
    })
  }
  const definition = template.definitions.find(definition => definition.id === item.id) as TemplateRule | undefined
  const spec = definition?.calculator
  const descriptor = findCalculator(spec, calculators)
  const type = metricValueSchema(template, item.id, calculators)
  const label = item.label === item.id ? descriptor?.name || item.label : item.label
  const labels = metricValueLabels(template,item.id)
  const schema = type?.type === 'enum' ? type : labels.length ? {type:'enum',valueType:type,elements:labels.map(item=>({value:item.value,text:item.name}))} : type
  const metadata = [
    {path:['inputTimeStart'],name:system('输入区间开始','Input interval start'),schema:{type:'date'},suffix:'getInputTimeStart()'},
    {path:['inputTimeEnd'],name:system('输入区间结束','Input interval end'),schema:{type:'date'},suffix:'getInputTimeEnd()'},
    ...(definition?.stateTracking ? [{path:['state','duration'],name:system('本次状态时长','Current state duration'),schema:{type:'double',unit:'s'},suffix:'getState().getDuration()'}] : []),
  ].map(field=>({key:`metadata:${item.id}:${field.path.join('.')}`,label:`${label} · ${field.name}`,displayLabel:field.name,metricId:item.id,group:'data' as const,
    expression:`metricValues['${alias.replaceAll("'", "''")}'].${field.suffix}`,referenceId:'metricValues',path:[alias,...field.path],schema:field.schema,unit:'unit' in field.schema ? field.schema.unit : undefined,
    ...(field.path[0] === 'state' ? {semantic:'stateDuration' as const} : {})}))
  return [{ key: item.id, label, metricId: item.id, group: 'data' as const, expression: dataAlias(alias), schema,unit:String(type?.unit || template.inputDefinitions.find(input=>input.id === item.id)?.unit || '') },
    ...fields(type, item.id, label, dataAlias(alias), descriptor?.configuration.outputType),...metadata]
}

/** Editing and read-only display use the same backend input aliases and parameter paths. */
export function ruleFormulaReferences(template: MetricTemplate, rule: TemplateRule, calculators: MetricCalculatorDescriptor[] = [], locale = 'zh'): FormulaReference[] {
  const inputAlias = (id: string) => rule.inputs?.find(input => !input.source && input.metricId === id)?.id || id
  return [
    ...ruleDataReferences(template, rule).flatMap(item => dataFormulaReferences(template, item, calculators, locale, inputAlias(item.id))),
    ...(rule.inputs || []).flatMap(item => item.source && item.id ? [{ key: `source:${item.id}`, label: item.id, group: 'data' as const, expression: dataAlias(item.id) }] : []),
    ...template.parameterDefinitions.map(item => ({ key: `parameter:${item.id}`, label: item.name || item.id, group: 'parameter' as const,
      expression: /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(item.id) ? `params.${item.id}` : `params['${item.id.replaceAll("'", "''")}']`, schema:item.valueType })),
    {key:'system:processTime',referenceId:'sample',path:['processTime'],label:locale.startsWith('en') ? 'Calculation time' : '计算时间',group:'data' as const,expression:'sample.getProcessTime()',schema:{type:'date'}},
  ]
}

// Alphabetic macro names survive MathLive serialization and never depend on display labels.
export function referenceMacro(index: number): string {
  let letters = ''
  do { letters = String.fromCharCode(97 + index % 26) + letters; index = Math.floor(index / 26) - 1 } while (index >= 0)
  return `JL${letters}`
}
export function formulaMacros(references: FormulaReference[]) {
  return Object.fromEntries(references.map((item, index) => [referenceMacro(index), {
    def: `\\htmlData{expression-reference-index=${index}}{\\text{${item.label.replace(/[\\{}%$&#_^~]/g, ' ')}}}`, captureSelection: true, expand: false,
  }]))
}

function parse(tokens: Token[], semantic = false): Node {
  let cursor = 0
  function primary(): Node {
    const token = tokens[cursor++]
    if (typeof token === 'object') return token
    if (token === '+' || token === '-' || token === '!') return { kind: 'unary', operator: token, value: primary() }
    if (token === '(' || token === '{') {
      const node = expression(0)
      if (tokens[cursor++] !== (token === '(' ? ')' : '}')) throw new Error('group')
      return node
    }
    if (formulaFunctions.includes(token as FunctionName)) {
      if (tokens[cursor++] !== '(') throw new Error('function')
      const args = [expression(0)]
      while (tokens[cursor] === ',') { cursor++; args.push(expression(0)) }
      if (tokens[cursor++] !== ')') throw new Error('function')
      const name = token as FunctionName
      if ((name === 'abs' || name === 'sqrt') && args.length !== 1 || name === 'round' && args.length > 2) throw new Error('arity')
      return { kind: 'function', name, args }
    }
    throw new Error('operand')
  }
  function expression(minimum: number): Node {
    let left = primary()
    while (typeof tokens[cursor] === 'string' && (precedence[tokens[cursor] as string] || 0) > minimum) {
      const operator = tokens[cursor++] as string
      left = { kind: 'binary', operator, left, right: expression(precedence[operator]) }
    }
    // 三元表达式为最低优先级且右结合；可展示不意味着MathLive可编辑。
    if (semantic && minimum === 0 && tokens[cursor] === '?') {
      cursor++
      const yes = expression(0)
      if (tokens[cursor++] !== ':') throw new Error('conditional')
      left = { kind:'conditional', condition:left, yes, no:expression(0) }
    }
    return left
  }
  const result = expression(0)
  if (cursor !== tokens.length) throw new Error('trailing')
  return result
}

function sourceTokens(source: string, references: FormulaReference[], conditions = false, semantic = false): Token[] {
  const tokens: Token[] = []
  // SpEL supports both root properties and #variables. Match either without rewriting source text.
  const ordered = references.flatMap(reference => [reference.expression,
    reference.expression.startsWith('#') ? reference.expression.slice(1) : `#${reference.expression}`,
  ].map(expression => ({ reference, expression }))).sort((a, b) => b.expression.length - a.expression.length)
  let rest = source.trim()
  while (rest) {
    const reference = ordered.find(item => rest.startsWith(item.expression) && !/[\w$]/.test(rest[item.expression.length] || ''))
    if (reference) { tokens.push({ kind: 'reference', reference: reference.reference }); rest = rest.slice(reference.expression.length).trimStart(); continue }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
    const fn = rest.match(/^\$math\.(abs|min|max|round|sqrt)\b/)
    const condition = conditions && rest.match(/^(?:&&|\|\||==|!=|<=|>=|[!<>])/)
    const literal = semantic && rest.match(/^(?:'((?:[^']|'')*)'|"((?:[^"]|"")*)"|(true|false|null)\b)/)
    if (literal) {
      const value = literal[1] !== undefined ? literal[1].replaceAll("''", "'") : literal[2] !== undefined ? literal[2].replaceAll('""', '"') : literal[3] === 'null' ? null : literal[3] === 'true'
      tokens.push({ kind:'literal', value }); rest = rest.slice(literal[0].length)
    }
    else if (number) { tokens.push({ kind: 'number', value: number[0] }); rest = rest.slice(number[0].length) }
    else if (fn) { tokens.push(fn[1]); rest = rest.slice(fn[0].length) }
    else if (condition) { tokens.push(condition[0]); rest = rest.slice(condition[0].length) }
    else if (semantic && /^[?:]/.test(rest)) { tokens.push(rest[0]); rest = rest.slice(1) }
    else if (/^[()+\-*/,]/.test(rest)) { tokens.push(rest[0]); rest = rest.slice(1) }
    else throw new Error('unsupported')
    rest = rest.trimStart()
  }
  return tokens
}

function latexTokens(latex: string, references: FormulaReference[], conditions = false): Token[] {
  let rest = latex.trim()
  const tokens: Token[] = []
  function group(): Token[] {
    rest = rest.trimStart()
    if (rest[0] !== '{') throw new Error('group')
    let depth = 1; let end = 1
    while (end < rest.length && depth) { if (rest[end] === '{') depth++; if (rest[end] === '}') depth--; end++ }
    if (depth) throw new Error('group')
    const content = rest.slice(1, end - 1); rest = rest.slice(end)
    return latexTokens(content, references, conditions)
  }
  while (rest) {
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
    const command = rest.match(/^\\([a-zA-Z]+|[,;! ])/)
    if (number) { tokens.push({ kind: 'number', value: number[0] }); rest = rest.slice(number[0].length) }
    else if (command) {
      const name = command[1]; rest = rest.slice(command[0].length)
      const index = references.findIndex((_item, i) => referenceMacro(i) === name)
      if (index >= 0) tokens.push({ kind: 'reference', reference: references[index] })
      else if (['left', 'right', ',', ';', '!', ' '].includes(name)) { /* Presentation only. */ }
      else if (name === 'times' || name === 'cdot') tokens.push('*')
      else if (name === 'div') tokens.push('/')
      else if (conditions && conditionCommands[name]) tokens.push(conditionCommands[name])
      else if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const numerator = group(); const denominator = group()
        tokens.push('(', ...numerator, ')', '/', '(', ...denominator, ')')
      } else if (name === 'sqrt') tokens.push('sqrt', '(', ...group(), ')')
      else if (name === 'mathord') tokens.push('(', ...group(), ')')
      else if (name === 'operatorname' || name === 'mathrm') {
        // MathLive normalizes inserted function names to operatorname{mathrm{name}}.
        const fn = rest.match(/^\{(?:(abs|min|max|round|sqrt)|\\mathrm\{(abs|min|max|round|sqrt)\})\}/)
        if (!fn) throw new Error('unsupported')
        tokens.push(fn[1] || fn[2]); rest = rest.slice(fn[0].length)
      } else if (formulaFunctions.includes(name as FunctionName)) tokens.push(name)
      else throw new Error('unsupported')
    } else if (conditions && /^[=<>]/.test(rest)) { tokens.push(rest[0] === '=' ? '==' : rest[0]); rest = rest.slice(1) }
    else if (/^[{}()+\-*/,]/.test(rest)) { tokens.push(rest[0]); rest = rest.slice(1) }
    else throw new Error('unsupported')
    rest = rest.trimStart()
  }
  return tokens
}

function toLatex(node: Node, references: FormulaReference[], parentPrecedence = 0): string {
  switch (node.kind) {
    case 'literal': case 'conditional': throw new Error('display only')
    case 'number': return node.value
    case 'reference': return `\\mathord{\\${referenceMacro(references.indexOf(node.reference))}}`
    case 'unary': return `${node.operator === '!' ? '\\lnot ' : node.operator}${toLatex(node.value, references, 7)}`
    case 'function': return node.name === 'sqrt' ? `\\sqrt{${toLatex(node.args[0], references)}}`
      : `\\operatorname{${node.name}}\\left(${node.args.map(item => toLatex(item, references)).join(',')}\\right)`
    case 'binary': {
      if (node.operator === '/') return `\\frac{${toLatex(node.left, references)}}{${toLatex(node.right, references)}}`
      const level = precedence[node.operator]
      const content = `${toLatex(node.left, references, level)}${latexOperators[node.operator] || node.operator}${toLatex(node.right, references, level + 1)}`
      return level < parentPrecedence ? `\\left(${content}\\right)` : content
    }
  }
}
function toSource(node: Node): string {
  switch (node.kind) {
    case 'literal': case 'conditional': throw new Error('display only')
    case 'number': return node.value
    case 'reference': return node.reference.expression
    case 'unary': return `${node.operator}(${toSource(node.value)})`
    case 'function': return `$math.${node.name}(${node.args.map(toSource).join(', ')})`
    case 'binary': return `(${toSource(node.left)} ${node.operator} ${toSource(node.right)})`
  }
}

/** undefined selects advanced mode without altering the original expression. */
export function expressionToFormula(source: string, references: FormulaReference[], conditions = false): string | undefined {
  if (!source.trim()) return ''
  try { return toLatex(parse(sourceTokens(source, references, conditions)), references) } catch { return undefined }
}

/** Read-only and editable conditions use the same conversion. */
export function expressionToDisplayFormula(source: string, references: FormulaReference[]): string | undefined {
  return expressionToFormula(source, references, true)
}

/** 只解析已声明引用与受限语法，不执行SpEL；未知访问必须完整回退，不能部分翻译。 */
export function parseDisplayExpression(source:string, references:FormulaReference[]): FormulaNode | undefined {
  if (!source.trim() || source.length > 16000) return undefined
  try { return parse(sourceTokens(source, references, true, true), true) } catch { return undefined }
}

export function formulaReferencePath(reference:FormulaReference):{id:string;path:string[]} {
  if(reference.referenceId)return {id:reference.referenceId,path:reference.path || []}
  return reference.group === 'parameter' ? {id:'params',path:[reference.key.slice('parameter:'.length)]}
    : {id:reference.expression.match(/^#?([a-zA-Z0-9_]+)/)?.[1] || reference.key,path:reference.path || []}
}

/** 复用现有受限解析器导入；任何不能完整表示的脚本继续使用高级模式。 */
export function expressionToTree(source:string,references:FormulaReference[]):StructuredExpression|undefined {
  const parsed=parseDisplayExpression(source,references)
  if (!parsed) return undefined
  const operators:Record<string,string>={'+':'add','-':'subtract','*':'multiply','/':'divide','%':'mod','==':'eq','!=':'ne','>':'gt','>=':'ge','<':'lt','<=':'le'}
  function convert(node:FormulaNode):ExpressionNode {
    switch(node.kind) {
      case 'number': {
        const fractional=/[.eE]/.test(node.value),integer=fractional ? 0n : BigInt(node.value)
        return {type:'literal',valueType:fractional ? 'double' : integer >= -2147483648n && integer <= 2147483647n ? 'int' : 'long',value:node.value}
      }
      case 'literal': return {type:'literal',valueType:node.value === null ? 'null' : typeof node.value === 'boolean' ? 'boolean' : 'string',value:node.value}
      case 'reference': return {type:'reference',...formulaReferencePath(node.reference)}
      case 'unary': return {type:'unary',operator:node.operator === '-' ? 'negate' : node.operator === '+' ? 'positive' : 'not',operand:convert(node.value)}
      case 'binary': return node.operator === '&&' || node.operator === '||' ? {type:'logical',operator:node.operator === '&&' ? 'and' : 'or',operands:[convert(node.left),convert(node.right)]}
        : {type:'binary',operator:operators[node.operator],left:convert(node.left),right:convert(node.right)}
      case 'conditional': return {type:'conditional',condition:convert(node.condition),whenTrue:convert(node.yes),whenFalse:convert(node.no)}
      case 'function': return {type:'call',function:`math.${node.name}`,arguments:node.args.map(convert)}
    }
  }
  return {version:1,root:convert(parsed)}
}

/** Incomplete visual drafts throw and must not overwrite the last valid rule. */
export function formulaToExpression(latex: string, references: FormulaReference[], conditions = false): { expression: string; metricIds: string[] } {
  const node = parse(latexTokens(latex, references, conditions))
  const ids = new Set<string>()
  function visit(item: Node) {
    if (item.kind === 'reference' && item.reference.metricId) ids.add(item.reference.metricId)
    else if (item.kind === 'binary') { visit(item.left); visit(item.right) }
    else if (item.kind === 'unary') visit(item.value)
    else if (item.kind === 'function') item.args.forEach(visit)
  }
  visit(node)
  return { expression: toSource(node), metricIds: [...ids] }
}
