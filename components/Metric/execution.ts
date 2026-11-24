import type { MetricExecutionSnapshot, MetricTemplate, MetricValue } from './types'
import { nodeKey, ruleMetricIds, type TemplateNode, type TemplateRule } from './template/designer'
import { evidenceGroups } from './evidence'
import { metricResultReference } from './presentation'

export type MetricExecutionStep = MetricExecutionSnapshot['steps'][number]
export interface MetricExecutionRead {
  step:MetricExecutionStep
  input:ReturnType<typeof evidenceGroups>[number]
  value:MetricValue
}

/** 后端已提供当次结构化事实；前端仅映射图上的位置，不重建判定或执行依赖。 */
export function metricExecutionSteps(snapshot:MetricExecutionSnapshot | undefined,resultId?:string):MetricExecutionStep[] {
  return !snapshot || resultId && metricResultReference(snapshot) !== resultId ? [] : snapshot.steps
}

function inputValue(step:MetricExecutionStep,group:MetricExecutionRead['input']):MetricValue {
  const {input,values:leaves} = group
  const leaf = leaves.find(item=>item.path === '/value')
  const value = !leaf || leaf.type === 'unavailable' || leaf.type === 'omitted' ? undefined
    : leaf.type === 'null' ? null : leaf.type === 'boolean' ? leaf.value === 'true'
    : leaf.type === 'number' && Number.isFinite(Number(leaf.value)) && Math.abs(Number(leaf.value)) <= Number.MAX_SAFE_INTEGER ? Number(leaf.value) : leaf.value
  // 对象节点只显示已记录字段数，具体叶子仍由公共依据组件展示，不拼装或重算业务对象。
  const fields = leaves.filter(item=>item.path.startsWith('/value/') && item.type !== 'omitted')
  const summary = !leaf && fields.length ? Object.fromEntries(fields.map(item=>[item.path.split('/')[2],null])) : value
  return {metricId:group.metricId,value:summary,eventTime:input?.inputTimeEnd,evaluationTime:step.value.evaluationTime,
    status:[leaf,...fields].some(item=>item && ['available','defaulted'].includes(item.state)) ? 'success' : 'invalid'}
}

/** 同来源的不同时间、样本和取值不能合并成一个“当前值”。 */
export function distinctExecutionReads(reads:MetricExecutionRead[]):MetricExecutionRead[] {
  const seen = new Set<string>()
  return reads.filter(read=>{
    const signature = JSON.stringify([read.input.input?.inputTimeStart,read.input.input?.inputTimeEnd,read.input.input?.count,
      read.input.values.map(({path,type,value,state})=>[path,type,value,state])])
    if (seen.has(signature)) return false
    seen.add(signature); return true
  })
}

/** 图只投影本次记录，不把定义数组顺序解释为执行时间线。 */
export function executionGraph(template:MetricTemplate,snapshot?:MetricExecutionSnapshot) {
  const nodes:Record<string,string> = {}, values:Record<string,MetricValue> = {}, owners:Record<string,MetricExecutionStep> = {}
  const reads:Record<string,MetricExecutionRead[]> = {}, edges = new Set<string>()
  const sourceKey = (id:string) => {
    const input = template.inputDefinitions.findIndex(item=>item.id === id)
    if (input >= 0) return `input-${input}`
    const rule = template.definitions.findIndex(item=>ruleMetricIds(item as TemplateRule).includes(id))
    return rule < 0 ? undefined : `rule-${rule}`
  }
  const baseline = snapshot?.truncated ? 'incomplete' : 'inactive'
  template.inputDefinitions.forEach((_,i)=>nodes['input-'+i] = baseline)
  template.definitions.forEach((_,i)=>nodes['rule-'+i] = baseline)
  template.outputs.forEach((_,i)=>nodes['output-'+i] = baseline)
  snapshot?.steps.forEach(step=>{
    const index = template.definitions.findIndex(item=>item.id === step.definitionId)
    const rule = index < 0 ? undefined : `rule-${index}`
    if (rule) {
      nodes[rule] = step.state === 'skipped' ? 'inactive' : 'done'
      owners[rule] = step
      if (step.state !== 'skipped') values[rule] = step.value
    }
    if (step.state === 'skipped') return
    step.outputs.forEach(value=>template.outputs.forEach((output,index)=>{
      if (output.metricId !== value.metricId) return
      const key = `output-${index}`
      nodes[key] = 'done'; values[key] = value; owners[key] = step
      if (rule) edges.add(`${rule}:${key}`)
    }))
    evidenceGroups(step.value.evidence,template,'input',step.definitionId).forEach(input=>{
      const source = sourceKey(input.metricId)
      if (!source) return
      const items = reads[source] ||= []
      items.push({step,input,value:inputValue(step,input)})
      if (rule && source !== rule) edges.add(`${source}:${rule}`)
    })
  })
  for (const [key,items] of Object.entries(reads)) {
    if (!owners[key] || owners[key].state === 'skipped') {
      nodes[key] = 'done'
      const distinct = distinctExecutionReads(items)
      if (distinct.length === 1) values[key] = distinct[0].value
    }
  }
  return {nodes,values,owners,reads,edges}
}

/** 聚焦某一步时只使用该步记录的来源值，不借用另一时刻的读取。 */
export function executionReadForStep(reads:MetricExecutionRead[],step?:MetricExecutionStep) {
  const own = step ? reads.filter(read=>read.step === step) : reads
  const distinct = distinctExecutionReads(own)
  return distinct.length === 1 ? distinct[0] : undefined
}

export function executionNodeMetric(template:MetricTemplate,node:TemplateNode) {
  return node.kind === 'input' ? template.inputDefinitions[node.index]?.id : node.kind === 'rule'
    ? String(template.definitions[node.index]?.id || '') : template.outputs[node.index]?.metricId || ''
}

export const executionNodeKey = nodeKey
