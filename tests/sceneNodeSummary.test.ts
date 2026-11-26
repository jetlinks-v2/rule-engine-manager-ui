import assert from 'node:assert/strict'
import test from 'node:test'
import { getNotificationSummary } from '../views/SceneLinkage/editor/notificationSummary'

const t = (key: string, values?: Record<string, string | number>) => values?.count !== undefined ? `已选择 ${values.count} 位接收人` : key

test('notification labels follow selected IDs rather than API response order', () => {
  const config = { userIds: ['u2', 'u1'], notifyChannelIds: ['mail'] }
  const snapshot = structuredClone(config)
  const summary = getNotificationSummary(config, {}, t,
    [{ id: 'u1', name: '张三' }, { id: 'u2', name: '李四' }, { id: 'other', name: '无关用户' }],
    [{ id: 'mail', name: '站内信', providerId: 'scene', channelProvider: 'inside-mail' }])
  assert.deepEqual(summary, { method: '站内信', recipients: ['李四', '张三'] })
  assert.deepEqual(config, snapshot)
})

test('cached recipient labels use identity and do not expose unresolved user IDs', () => {
  const options = { channelName: '邮件', users: [{ id: 'old', name: '已移除的用户' }, { id: 'u1', name: '张三' }] }
  const summary = getNotificationSummary({ userIds: ['u1', 'unknown'] }, options, t)
  assert.deepEqual(summary, { method: '邮件', recipients: ['张三', '已选择 1 位接收人'] })
})

test('legacy cached string names and deleted-user fallback remain readable', () => {
  assert.deepEqual(getNotificationSummary({ userIds: ['u1'] }, { channelName: '短信', userNames: '张三' }, t), { method: '短信', recipients: ['张三'] })
  assert.deepEqual(getNotificationSummary({ userIds: ['unknown'] }, { channelName: '站内信' }, t), { method: '站内信', recipients: ['已选择 1 位接收人'] })
})
