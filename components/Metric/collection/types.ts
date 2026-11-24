import type { MetricTemplateOutput, MetricValue, MetricStateLabel } from '../types'
export type ReadOperation = 'collection' | 'distribution' | 'average' | 'min' | 'max' | 'sum' | 'ratio'
export type ReadSemantic = 'state' | 'score' | 'duration' | 'quantity' | 'ratio' | 'numeric'
export interface MetricAggregateQuery { rootType:string;rootId:string;memberType:string;depth:'self'|'children'|'descendants';from:number;to:number;interval:number;templateIds?:string[] }
export interface MetricAggregateTemplate { templateId:string;templateName:string }
export interface MetricAggregatePoint { time:number;observed:number;valid:number;sum?:number;min?:number;max?:number;distribution:Record<string,number> }
export interface MetricAggregateGroup {
  id:string;cardId:string;templateId:string;templateName:string;version:string;revision:number;output:MetricTemplateOutput;displaySettings?:Record<string,unknown>
  operations:ReadOperation[];defaultOperation:ReadOperation;stateLabels?:MetricStateLabel[];latest:MetricAggregatePoint;points:MetricAggregatePoint[];availability?:'noRecords'|'unsupported'
}
export interface MetricAggregateResult { readTime:number;from:number;to:number;interval:number;groups:MetricAggregateGroup[];availability?:'available'|'noRecords'|'unsupported' }
export interface MetricReadAggregation {
  semantic: ReadSemantic
  operations: ReadOperation[]
  defaultOperation: ReadOperation
  defaultView: 'list' | 'bars' | 'ranking'
  exclusiveContributions?: boolean
  numerator?: string
  denominator?: string
}
export interface MetricReadScopeOption { memberType: string; label: string; icon: string; tree?: boolean }
/** 汇总入口区分已添加的结果与声明的对象范围；添加指标不会改变对象成员关系。 */
export interface MetricAggregateScope extends MetricReadScopeOption { kind:'members'|'linked' }
export interface MetricCollectionQuery {
  rootType: string; rootId: string; memberType: string
  depth: 'self' | 'children' | 'descendants'
  group?: string; operation: ReadOperation; pageIndex: number; pageSize: number
  groups?: string[]
  templateId?:string
  includeUnconfigured?: boolean
  pageByMember?: boolean
}
/** Current-result drilldown carries the summary scope, never an implied historical time range. */
export interface MetricCollectionSelection { templateId?:string; group?:string; descendants?:boolean }
export interface MetricScopeOverviewRequest {
  rootType:string; rootId:string; memberType:string; depth:'self'|'children'|'descendants'; templateIds:string[]
}
export interface MetricScopeOverview {
  readTime:number; visibleMembers:number; templates:MetricScopeTemplateOverview[]
}
export interface MetricScopeTemplateOverview {
  templateId:string
  coverage:{ enabledMembers:number; inheritedMembers:number; directMembers:number; disabledMembers:number; unconfiguredMembers:number }
  outputs:Array<{ group:MetricCollectionGroup; summary?:MetricCollectionResult['summary']; validResults:number; expectedResults:number; readFailures:number; incompatiblePeriod:boolean }>
}
export interface MetricCollectionGroup {
  id: string; cardId?:string; templateId: string; templateName: string; version: string; revision?: number
  output: MetricTemplateOutput; policy?: MetricReadAggregation; operations: ReadOperation[]; total: number
  stateLabels?: MetricStateLabel[]; displaySettings?: Record<string, unknown>
}
export interface MetricCollectionRow {
  kind?: 'metric'; configState?: 'enabled' | 'disabled'
  key: string; group: string; configId: string; configName?: string; ownerType: string; ownerId: string
  target: { type: string; id: string; name: string; path?: string }
  dataVersion: string; output: MetricTemplateOutput; value?: MetricValue
  highlights?: Array<{ output:MetricTemplateOutput; value?:MetricValue }>
}
export interface MetricUnconfiguredMember {
  kind: 'unconfigured'; key: string; target: MetricCollectionRow['target']
}
export type MetricCollectionItem = MetricCollectionRow | MetricUnconfiguredMember
export interface MetricCollectionResult {
  readTime: number; visibleMembers: number; total: number; groups: MetricCollectionGroup[]; data: MetricCollectionItem[]
  coverage?: { configuredMembers: number; unconfiguredMembers: number }
  summary?: { operation: ReadOperation; valid: number; missing: number; value?: number; distribution: Record<string, number> }
}
