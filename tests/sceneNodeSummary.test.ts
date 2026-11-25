import assert from 'node:assert/strict'
import test from 'node:test'
import { getNotificationSummary, formatNotificationRecipient, getNotificationRecipientGroups } from '../views/SceneLinkage/editor/notificationSummary'

const t = (key: string, values?: Record<string, string | number>) => values?.count !== undefined ? `已选择 ${values.count} 位接收人` : key

test('通知预览依次展示非空部门、成员、标签，保留跨类型相同 ID', () => {
  const config = { userIds: ['same'], dimensions: [{ type: 'role' as const, id: 'same' }, { type: 'org' as const, id: 'same' }] }
  const snapshot = structuredClone(config)
  const groups = getNotificationRecipientGroups(config, { recipientScopes: [
    { type: 'org', id: 'same', name: '研发部' }, { type: 'role', id: 'same', name: '值班组' },
  ] }, t, [{ id: 'same', name: '张三', username: 'zhangsan' }])
  assert.deepEqual(groups, [
    { type: 'org', items: [{ id: 'same', name: '研发部' }] },
    { type: 'people', items: [{ id: 'same', name: '张三' }] },
    { type: 'role', items: [{ id: 'same', name: '值班组' }] },
  ])
  assert.deepEqual(config, snapshot)
  assert.deepEqual(getNotificationRecipientGroups({ userIds: ['missing'] }, {}, t), [
    { type: 'people', items: [{ id: 'missing', name: '已选择 1 位接收人' }] },
  ])
})

test('固定目标渠道摘要不显示收信人未配置或历史人员', () => {
  const method = { id: 'hook', name: 'Webhook', providerId: 'scene', channelProvider: 'notifier-webhook' }
  const summary = getNotificationSummary({ notifyChannelIds: ['hook'], userIds: ['old'] }, { users: [{ id: 'old', name: '历史人员' }] }, t, [], [method])
  assert.deepEqual(summary, { method: 'Webhook', recipients: [], fixedRecipient: true })
  const cached = getNotificationSummary({ notifyChannelIds: ['hook'] }, { channelName: 'Webhook', fixedRecipient: true }, t)
  assert.deepEqual(cached, { method: 'Webhook', recipients: [], fixedRecipient: true })
})

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

test('recipient selection includes username even when identical while summaries show names only', () => {
  assert.equal(formatNotificationRecipient({ name: '张三', username: 'zhangsan' }), '张三（zhangsan）')
  assert.equal(formatNotificationRecipient({ name: 'admin', username: 'admin' }), 'admin（admin）')
  assert.equal(formatNotificationRecipient({ username: 'admin' }), 'admin')
  assert.equal(formatNotificationRecipient({ name: '张三' }), '张三')
  const result = getNotificationSummary({ userIds: ['u1', 'u2'] }, { users: [{ id: 'u2', name: '李四', username: 'lisi' }] }, t, [{ id: 'u1', name: '张三', username: 'zhangsan', email: 'private@example.com', telephone: '12345678' }])
  assert.deepEqual(result.recipients, ['张三', '李四'])
})
