import assert from 'node:assert/strict'
import test from 'node:test'
import { ALL_DEVICES_COUNT_KEY, UNBOUND_SPACE_KEY, buildScopeCountRequests, filterScopeTree } from '../views/SceneLinkage/editor/deviceScopeTree'

const tree = [{ key: 'parent', title: '园区', children: [{ key: 'a', title: '一层' }, { key: 'b', title: '二层' }] }]

test('device counts use one request per scope and count parent devices without adding child counts', () => {
  const input = structuredClone(tree)
  const requests = buildScopeCountRequests('fixed', [{ key: '', title: '全部' }, { key: UNBOUND_SPACE_KEY, title: '未绑定' }, ...input])
  assert.deepEqual(requests.find(row => row.id === ALL_DEVICES_COUNT_KEY)?.query.terms, [])
  assert.deepEqual(requests.find(row => row.id === UNBOUND_SPACE_KEY)?.query.terms, [{ column: 'id', termType: 'space-bind$any$not', value: '__any_space_binding__' }])
  assert.deepEqual(requests.find(row => row.id === 'parent')?.query.terms, [{ column: 'id', termType: 'space-bind$device', value: ['parent', 'a', 'b'] }])
  assert.deepEqual(input, tree)
})

test('group and organization counts match selector semantics instead of using a space query', () => {
  const group = buildScopeCountRequests('device-group', tree).find(row => row.id === 'parent')
  assert.deepEqual(group?.query.terms, [{ column: 'id', termType: 'dev-group', value: ['parent', 'a', 'b'] }])
  const org = buildScopeCountRequests('org', tree).find(row => row.id === 'parent')
  assert.deepEqual(org?.query.terms, [{ column: 'id', termType: 'dim-assets', value: { assetType: 'device', targets: [{ type: 'org', id: 'parent' }, { type: 'org', id: 'a' }, { type: 'org', id: 'b' }] } }])
})

test('search preserves ancestors without changing the full scope tree', () => {
  assert.deepEqual(filterScopeTree(tree, '一层'), [{ ...tree[0], children: [tree[0].children[0]] }])
  assert.deepEqual(filterScopeTree(tree, '园区'), tree)
  assert.deepEqual(filterScopeTree(tree, '不存在'), [])
  assert.equal(tree[0].children.length, 2)
})

test('variable, relation and tag scopes do not query resource tree counts', () => {
  for (const mode of ['context', 'relation', 'tag'] as const) assert.deepEqual(buildScopeCountRequests(mode, tree), [])
})
