import { wsClient } from '@jetlinks-web/core'
import { postRuntimeNdJson } from '@jetlinks-web-core/utils/ndjson-precision'
import { defer, map, timeout } from 'rxjs'
import type { RuleListItem, RuleRuntimeFrame } from '../views/Instance/listTypes'

export interface RuleListQuery { terms?: unknown[] }
export interface RuleListCursor { beforeTime: number; beforeId: string }
export function streamRuleInstances(query: RuleListQuery, cursor?: RuleListCursor) {
  const terms: unknown[] = query.terms?.length ? [{ terms: query.terms }] : []
  if (cursor) terms.push({ terms: [
    { column: 'createTime', termType: 'lt', value: cursor.beforeTime },
    { type: 'or', terms: [
      { column: 'createTime', termType: 'eq', value: cursor.beforeTime },
      { column: 'id', termType: 'lt', value: cursor.beforeId },
    ] },
  ] })
  // no-paging omits the count envelope; paging=true still bounds the underlying database query.
  return postRuntimeNdJson<RuleListItem>('/rule-engine/instance/_query/no-paging', {
    terms, paging: true, pageIndex: 0, pageSize: 32,
    sorts: [{ name: 'createTime', order: 'desc' }, { name: 'id', order: 'desc' }],
    includes: ['id', 'name', 'description', 'state', 'modelType', 'modelVersion', 'createTime'],
  })
}

let subscriptionId = 0
export const loadRulePreviews = (ids: string[]) => postRuntimeNdJson<{ id: string; metadata?: { thumbnailSvg?: string; icon?: unknown } }>(
  '/rule-engine/instance/_query/no-paging', {
    terms: [{ column: 'id', termType: 'in', value: ids }], includes: ['id', 'metadata'], paging: true, pageSize: 64,
  },
)
export const observeRuleInstances = (ruleIds: string[]) => defer(() =>
  wsClient.getWebSocket(`rule-runtime:${++subscriptionId}`, '/rule-instance/runtime/observe',
    { ruleIds, interval: 2000 }),
).pipe(map(message => message.payload as RuleRuntimeFrame), timeout({ each: 15000 }))
