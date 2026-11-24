import type { MetricTemplateOutput } from '../types'
import type { MetricReadAggregation, ReadOperation, ReadSemantic } from './types'

const operationPresentations:Record<ReadOperation,{icon:string;description:string}>={
  collection:{icon:'UnorderedListOutlined',description:'collectionHint'},distribution:{icon:'PieChartOutlined',description:'distributionHint'},
  average:{icon:'CalculatorOutlined',description:'averageHint'},min:{icon:'ArrowDownOutlined',description:'minHint'},max:{icon:'ArrowUpOutlined',description:'maxHint'},
  sum:{icon:'PlusOutlined',description:'sumHint'},ratio:{icon:'PercentageOutlined',description:'ratioHint'},
}
/** Shared icon and explanatory copy for menus, inline editors and selected read operations. */
export function readOperationPresentation(operation:ReadOperation) { return operationPresentations[operation] }

/** Suggestions are based on declared meaning and type; algorithm IDs never grant summation. */
export function suggestedReadSemantic(output: MetricTemplateOutput): ReadSemantic {
  if (['boolean','enum','string'].includes(output.valueType || '') || ['boolean','level','state'].includes(output.metricKind || '')) return 'state'
  if (output.metricKind === 'score') return 'score'
  if (output.metricKind === 'duration') return 'duration'
  if (output.metricKind === 'rate') return 'ratio'
  return 'numeric'
}
/** 自定义汇总沿用服务端声明类型约束，不从样本或计算方法推断结果类型。 */
export function supportedReadSemantics(valueType?:string):ReadSemantic[] {
  if (['byte','short','int','integer','long','float','double','number','decimal'].includes(valueType || '')) return ['state','score','duration','quantity','ratio','numeric']
  return ['boolean','string','enum'].includes(valueType || '') ? ['state'] : []
}
export function compatibleReadOperations(semantic: ReadSemantic, exclusive = false): ReadOperation[] {
  if (semantic === 'state') return ['collection','distribution']
  if (semantic === 'ratio') return ['collection']
  return ['collection','average','min','max', ...(semantic === 'quantity' && exclusive ? ['sum' as const] : [])]
}
export function readPolicy(semantic: ReadSemantic): MetricReadAggregation {
  const operations = compatibleReadOperations(semantic)
  return { semantic, operations, defaultOperation:semantic === 'state' ? 'distribution' : semantic === 'duration' ? 'max' : semantic === 'ratio' ? 'collection' : 'average', defaultView:'list' }
}
export function updateReadPolicy(output: MetricTemplateOutput, policy?: MetricReadAggregation): Pick<MetricTemplateOutput,'options'> {
  const options = { ...output.options }
  if (policy) options.readAggregation = policy
  else delete options.readAggregation
  return { options }
}
