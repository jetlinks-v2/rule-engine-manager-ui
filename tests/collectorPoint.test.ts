import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCollectorPoint } from '../views/Scene/Save/action/Collector/collectorPoint'

const hasRead = (point: { accessModeMask: number }) => (point.accessModeMask & 1) !== 0
const hasWrite = (point: { accessModeMask: number }) => (point.accessModeMask & 2) !== 0

test('converted point enums drive read/write choices without using protocol pointKey as the saved ID', () => {
  const input = { id: 'entity-id', name: '转速', pointKey: 'protocol-address', accessModes: [{ value: 'read', text: '读' }, { value: 'write', text: '写' }], metadata: { dataType: { type: 'int', unit: 'rpm' } } }
  const before = structuredClone(input)
  const point = normalizeCollectorPoint(input)
  assert.equal(hasRead(point), true)
  assert.equal(hasWrite(point), true)
  assert.equal(point.id, 'entity-id')
  assert.deepEqual(point.dataType, { type: 'int', unit: 'rpm' })
  assert.deepEqual(input, before)
})

test('string modes and enum modes respect read-only, write-only and subscription-only permissions', () => {
  const points = [
    { id: 'read', name: '只读', accessModes: ['read'] },
    { id: 'write', name: '只写', accessModes: [{ value: 'write', text: '写' }] },
    { id: 'subscribe', name: '订阅', accessModes: ['subscribe'] },
    { id: 'none', name: '无权限', accessModes: [] },
    { id: 'unknown', name: '未知', accessModes: ['unknown'] },
    { id: 'missing', name: '未提供权限' },
  ].map(normalizeCollectorPoint)
  assert.deepEqual(points.filter(hasRead).map(point => point.id), ['read'])
  assert.deepEqual(points.filter(hasWrite).map(point => point.id), ['write'])
  assert.equal(points[2].accessModeMask, 4)
})

test('nested enum and boolean definitions retain zero, false and labels for write value editors', () => {
  const types = [
    { type: 'enum', elements: [{ value: 0, text: '停止' }, { value: 1, text: '启动' }] },
    { type: 'boolean', trueValue: 1, falseValue: 0, trueText: '开', falseText: '关', default: false },
  ]
  for (const dataType of types) {
    const point = normalizeCollectorPoint({ id: 'p', name: '开关', accessModes: ['write'], metadata: { dataType } })
    assert.deepEqual(point.dataType, dataType)
  }
  assert.equal(normalizeCollectorPoint({ id: 'p', name: '未解析类型', accessModes: ['read'] }).dataType, undefined)
})
