import type { MetricAggregatePoint,MetricAggregateGroup,MetricAggregateScope,MetricCollectionGroup,ReadOperation } from './types'

/** 同类型来源也可能属于不同统计范围，选择与偏好不能混用。 */
export const aggregateScopeKey=(scope:MetricAggregateScope)=>JSON.stringify([scope.kind,scope.memberType])

/** Authorized declarations remain visible without comparable stored rows; missing facts never become zero results. */
export function aggregateDirectory(records:MetricAggregateGroup[], directory:MetricCollectionGroup[]):MetricAggregateGroup[] {
  const result=[...records]
  for(const entry of directory) {
    if(!entry.cardId)continue
    const revision=entry.revision ?? 1
    const prefix=`${entry.templateId}:${entry.version}:${revision}:`
    const matches=records.filter(group=>group.templateId===entry.templateId && group.version===entry.version
      && group.revision===revision && group.cardId.startsWith(prefix+entry.cardId+':'))
    if(matches.some(group=>group.output.metricId===entry.output.metricId))continue
    const operations:ReadOperation[]=entry.output.persist===false || entry.output.latestOnly ? [] : entry.operations.filter(item=>item!=='collection' && item!=='ratio')
    result.push({id:'directory:'+entry.id,cardId:matches[0]?.cardId || 'directory:'+prefix+entry.cardId,
      templateId:entry.templateId,templateName:entry.templateName,version:entry.version,revision,
      output:entry.output,displaySettings:entry.displaySettings,stateLabels:entry.stateLabels,operations,
      defaultOperation:operations.includes(entry.policy?.defaultOperation!) ? entry.policy!.defaultOperation : operations[0] || 'collection',
      latest:{time:0,observed:0,valid:0,distribution:{}},points:[],availability:operations.length ? 'noRecords' : 'unsupported'})
  }
  return result
}

/** Keep template outputs together without merging different source/parameter/revision contributions. */
export function aggregateCards(groups:MetricAggregateGroup[]):Array<{id:string;groups:MetricAggregateGroup[]}> {
  const cards=new Map<string,MetricAggregateGroup[]>()
  for(const group of groups){const id=group.cardId || group.id;const entries=cards.get(id) || [];entries.push(group);cards.set(id,entries)}
  return [...cards].map(([id,groups])=>({id,groups}))
}

/** A bucket contains one latest sample per object; averaging must use valid objects, never report count. */
export function aggregateValue(point:MetricAggregatePoint,operation:ReadOperation):number | undefined {
  if(!point.valid)return
  if(operation==='average')return point.sum===undefined || point.sum===null ? undefined : point.sum/point.valid
  if(operation==='min')return point.min ?? undefined
  if(operation==='max')return point.max ?? undefined
  if(operation==='sum')return point.sum ?? undefined
}

/** Distribution keys are strings; restore declared scalar types before resolving labels and icons. */
export function aggregateStateValue(group:MetricAggregateGroup,key:string):unknown {
  const declared=group.stateLabels?.find(item=>String(item.value)===key)
  if(declared)return declared.value
  return group.output.valueType==='boolean' && (key==='true' || key==='false') ? key==='true' : key
}
