import test from 'node:test'
import assert from 'node:assert/strict'
import { selectDeviceVariables, type DeviceVariable } from '../views/Scene/Save/action/Device/deviceVariables'

const variables: DeviceVariable[] = [
  { id: 'scene', name: '设备触发输出的数据', children: [
    { id: 'scene.deviceId', name: '设备ID', options: { productId: 'p1' } },
    { id: 'scene.deviceName', name: '设备名称' },
    { id: 'scene.timestamp', name: '系统时间' },
  ] },
  { id: 'action_0', name: '上一动作', children: [
    { id: 'action_0.deviceId', options: { productId: 'p1' } },
    { id: 'action_0.success', name: '执行成功' },
  ] },
  { id: 'other', children: [{ id: 'other.deviceId', options: { productId: 'p2' } }] },
]

test('设备变量保留同产品的触发与前序动作设备ID，排除时间和状态', () => {
  const snapshot = structuredClone(variables)
  const result = selectDeviceVariables(variables, 'p1')
  assert.deepEqual(result.map(node => node.id), ['scene', 'action_0'])
  assert.deepEqual(result.flatMap(node => node.children?.map(child => child.id)), ['scene.deviceId', 'action_0.deviceId'])
  assert.ok(result.every(node => node.disabled && node.children?.every(child => !child.disabled)))
  assert.deepEqual(variables, snapshot)
})

test('手动触发只有系统时间时没有可选设备变量', () => {
  assert.deepEqual(selectDeviceVariables([{ id: 'scene', children: [{ id: 'scene.timestamp' }] }], 'p1'), [])
  assert.deepEqual(selectDeviceVariables(variables, 'missing'), [])
  assert.deepEqual(selectDeviceVariables(variables), [])
})

test('多触发变量递归保留完整路径并移除没有设备ID的分支', () => {
  const result = selectDeviceVariables([{ id: 'multi', children: variables }], 'p2')
  assert.equal(result[0]?.children?.[0]?.children?.[0]?.id, 'other.deviceId')
  assert.equal(result[0]?.children?.length, 1)
})
