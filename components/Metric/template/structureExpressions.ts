import { parseExpression } from '@babel/parser'
import type { ExpressionNode,StructuredExpression } from '@jetlinks-web-core/components/Expression/types'
import type { MetricTemplate } from '@jetlinks-web-core/components/Metric/types'
import { formulaReferencePath,ruleFormulaReferences,type FormulaReference } from '@jetlinks-web-core/components/Metric/template/formula'
import type { TemplateRule } from '@jetlinks-web-core/components/Metric/template/designer'
import { metricValueLabels } from '@jetlinks-web-core/components/Metric/valueSemantics'

type Syntax=ReturnType<typeof parseExpression>
const operators:Record<string,string>={'+':'add','-':'subtract','*':'multiply','/':'divide','%':'mod','==':'eq','!=':'ne','>':'gt','>=':'ge','<':'lt','<=':'le'}

/** 仅导入已声明引用及纯函数子集；不执行脚本，不把任意Java调用提升为公共配置。 */
export function importFormulaExpression(source:string,references:FormulaReference[]):StructuredExpression|undefined {
  const path=(node:Syntax):string[]|undefined=>{
    if(node.type === 'Identifier')return [node.name.replace(/^#/,'')]
    if(node.type === 'MemberExpression') {
      const base=path(node.object as Syntax)
      const field=node.computed ? node.property.type === 'StringLiteral' ? node.property.value : undefined : node.property.type === 'Identifier' ? node.property.name : undefined
      return base && field !== undefined ? [...base,field] : undefined
    }
    if(node.type === 'CallExpression' && !node.arguments.length && node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property.type === 'Identifier' && /^get[A-Z]/.test(node.callee.property.name)) {
      const base=path(node.callee.object as Syntax),name=node.callee.property.name.slice(3)
      return base ? [...base,name[0].toLowerCase()+name.slice(1)] : undefined
    }
  }
  try {
    const declared=new Map(references.flatMap(reference=>{const fields=path(parseExpression(reference.expression));return fields ? [[JSON.stringify(fields),formulaReferencePath(reference)] as const] : []}))
    // SpEL字符串和long后缀在词法边界转换，不能改写字符串内的L或丢失原数值文本。
    const text=source.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\b\d+[lL]\b/g,value=>value.startsWith("'") ? JSON.stringify(value.slice(1,-1).replaceAll("''","'")) : value.startsWith('"') ? JSON.stringify(value.slice(1,-1).replaceAll('""','"')) : value.slice(0,-1)+'n')
    const convert=(node:Syntax):ExpressionNode=>{
      const reference=declared.get(JSON.stringify(path(node)))
      if(reference)return {type:'reference',...reference}
      const raw=text.slice(node.start!,node.end!)
      if(node.type === 'ParenthesizedExpression')return convert(node.expression as Syntax)
      if(node.type === 'NumericLiteral') {const integer=/^\d+$/.test(raw) ? BigInt(raw) : undefined;return {type:'literal',valueType:integer === undefined ? 'double' : integer<=2147483647n ? 'int' : 'long',value:raw}}
      if(node.type === 'BigIntLiteral')return {type:'literal',valueType:'long',value:raw.slice(0,-1)}
      if(node.type === 'NullLiteral')return {type:'literal',valueType:'null',value:null}
      if(node.type === 'BooleanLiteral')return {type:'literal',valueType:'boolean',value:node.value}
      if(node.type === 'StringLiteral')return {type:'literal',valueType:'string',value:node.value}
      if(node.type === 'UnaryExpression' && ['+','-','!'].includes(node.operator))return {type:'unary',operator:node.operator === '!' ? 'not' : node.operator === '-' ? 'negate' : 'positive',operand:convert(node.argument as Syntax)}
      if(node.type === 'BinaryExpression' && operators[node.operator])return {type:'binary',operator:operators[node.operator],left:convert(node.left as Syntax),right:convert(node.right as Syntax)}
      if(node.type === 'LogicalExpression' && ['&&','||'].includes(node.operator)) {
        const operator=node.operator === '&&' ? 'and' : 'or'
        const operands=[convert(node.left as Syntax),convert(node.right as Syntax)].flatMap(child=>child.type === 'logical' && child.operator === operator ? child.operands : [child])
        return {type:'logical',operator,operands}
      }
      if(node.type === 'ConditionalExpression')return {type:'conditional',condition:convert(node.test as Syntax),whenTrue:convert(node.consequent as Syntax),whenFalse:convert(node.alternate as Syntax)}
      if(node.type === 'CallExpression') {
        const fn=path(node.callee as Syntax)
        if(fn?.length === 2 && fn[0] === '$math' && ['abs','min','max','round','sqrt'].includes(fn[1]))return {type:'call',function:`math.${fn[1]}`,arguments:node.arguments.map(item=>convert(item as Syntax))}
        if(!node.arguments.length && node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property.type === 'Identifier' && node.callee.property.name === 'doubleValue')return {type:'call',function:'data.toDouble',arguments:[convert(node.callee.object as Syntax)]}
      }
      throw new Error('unsupported')
    }
    return {version:1,root:convert(parseExpression(text,{createParenthesizedExpressions:true}))}
  } catch {return undefined}
}

/** 显式迁移入口；只改表达式字段，保留窗口、精度、触发、绑定和发布生命周期。 */
export function structureMetricTemplate(template:MetricTemplate):{template:MetricTemplate;converted:number;unsupported:string[]} {
  let converted=0
  const unsupported:string[]=[]
  const definitions=template.definitions.map(item=>{
    const rule={...item} as TemplateRule
    if(rule.temporalCondition)rule.temporalCondition={...rule.temporalCondition}
    const references=ruleFormulaReferences(template,rule)
    for(const [field,tree] of [['expression','expressionTree'],['applicabilityExpression','applicabilityTree'],['contextKeyExpression','contextKeyTree'],['enterExpression','enterTree'],['exitExpression','exitTree']] as const) {
      const target=field === 'enterExpression' || field === 'exitExpression' ? rule.temporalCondition : rule
      const source=target?.[field]
      if(typeof source !== 'string' || !source.trim())continue
      if(target?.[tree]){delete target[field];converted++;continue}
      const document=importFormulaExpression(source,references)
      if(!document){unsupported.push(`${rule.id}.${field}`);continue}
      Object.assign(target!,{[tree]:document});delete target![field];rule.language='spel';converted++
    }
    return rule
  })
  const inputDefinitions=template.inputDefinitions.map(input=>{
    const labels=metricValueLabels(template,input.id)
    return input.valueType?.type !== 'enum' && labels.length ? {...input,valueType:{type:'enum',valueType:input.valueType,elements:labels.map(item=>({value:item.value,text:item.name}))}} : input
  })
  return {template:{...template,inputDefinitions,definitions},converted,unsupported}
}
