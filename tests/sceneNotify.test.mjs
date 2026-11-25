import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const { outputFiles } = await build({
  stdin: {
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    contents: `
      export * from './utils/sceneNotify';
      export { canReceiveProfileBackedNotification, getNotifyUserOrganization } from './utils/notifyUser';
    `,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
})

const {
  canReceiveProfileBackedNotification,
  getNotifyUserOrganization,
  requiresSceneNotifyTemplate,
  toSceneNotifyMethods,
  isSceneNotifyConfigured,
  requiresSceneNotifyRecipients,
  changeSceneNotifyMethod,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
)

test('scene notification methods include inside mail and existing notifier channels only', () => {
  const methods = toSceneNotifyMethods([
    {
      id: 'scene-provider-id',
      provider: 'scene',
      channels: [
        { id: 'inside-mail', name: '站内信', channelProvider: 'inside-mail' },
        { id: 'email-channel', name: '邮件', channelProvider: 'notifier-email' },
        { id: 'unsupported-channel', name: 'Webhook', channelProvider: 'webhook' },
      ],
    },
    {
      id: 'device-alarm-provider-id',
      provider: 'device-alarm',
      channels: [{ id: 'other-inside-mail', name: '站内信', channelProvider: 'inside-mail' }],
    },
  ])

  assert.deepEqual(methods.map(method => method.channelProvider), ['inside-mail', 'notifier-email'])
  assert.equal(methods[0].providerId, 'scene-provider-id')
})

test('a channel that the backend does not return is not synthesized', () => {
  assert.deepEqual(toSceneNotifyMethods([{ id: 'scene-provider-id', provider: 'scene', channels: [] }]), [])
  assert.deepEqual(toSceneNotifyMethods([]), [])
})

test('inside mail does not query template details while notifier channels do', () => {
  assert.equal(requiresSceneNotifyTemplate('inside-mail'), false)
  assert.equal(requiresSceneNotifyTemplate('notifier-email'), true)
  assert.equal(requiresSceneNotifyTemplate('webhook'), false)
})

test('a current user with an id can receive inside mail without email or telephone', () => {
  const user = { id: 'user-1' }
  assert.equal(canReceiveProfileBackedNotification(user, 'inside-mail'), true)
  assert.equal(canReceiveProfileBackedNotification(user, 'notifier-email'), false)
  assert.equal(canReceiveProfileBackedNotification(user, 'notifier-sms'), false)
  assert.equal(canReceiveProfileBackedNotification({ id: '' }, 'inside-mail'), false)
})

test('通知对象沿用视觉告警的组织说明，缺少组织信息时不补造路径', () => {
  assert.equal(getNotifyUserOrganization({ orgName: ' 一级 / 二级 ' }), '一级 / 二级')
  assert.equal(getNotifyUserOrganization({ orgList: [{ name: '一级' }], parentOrgList: [{ name: '二级' }], childrenOrgList: [{ name: '三级' }] }), '一级 / 二级 / 三级')
  assert.equal(getNotifyUserOrganization({}), '')
})

test('Webhook 与钉钉机器人免选人员，工作通知和站内信需要通知对象', () => {
  const webhook = { id: 'hook', name: 'Webhook', channelProvider: 'notifier-webhook', providerId: 'scene', templateId: 'hook-template' }
  const robot = { id: 'robot', name: 'Robot', channelProvider: 'notifier-dingTalk', providerId: 'scene', fixedRecipient: true, templateId: 'robot-template' }
  const work = { ...robot, id: 'work', fixedRecipient: false }
  const inbox = { ...webhook, id: 'inbox', channelProvider: 'inside-mail' }
  const methods = [webhook, robot, work, inbox]
  for (const method of [webhook, robot]) {
    assert.equal(requiresSceneNotifyRecipients(method), false)
    assert.equal(isSceneNotifyConfigured({ notifyChannelIds: [method.id], userIds: [] }, methods), true)
  }
  for (const id of ['work', 'inbox', 'unknown']) {
    assert.equal(isSceneNotifyConfigured({ notifyChannelIds: [id], userIds: [] }, methods), false)
    assert.equal(isSceneNotifyConfigured({ notifyChannelIds: [id], userIds: ['u1'] }, methods), true)
  }
  assert.equal(isSceneNotifyConfigured({}, methods), false)
  assert.equal(isSceneNotifyConfigured(null, methods), false)
  assert.equal(isSceneNotifyConfigured({ notifyChannelIds: ['hook', 'inbox'], userIds: [] }, methods), false)
})

test('渠道目录仅将 Webhook 标记为固定目标，不改写服务器渠道标识', () => {
  const methods = toSceneNotifyMethods([{ provider: 'scene', id: 'scene', channels: [
    { id: 'hook', name: 'Webhook', channelProvider: 'notifier-webhook' },
    { id: 'robot', name: 'Robot', channelProvider: 'notifier-dingTalk' },
  ] }])
  assert.equal(methods[0].fixedRecipient, true)
  assert.equal(methods[1].fixedRecipient, undefined)
})

const api = await build({
  stdin: { resolveDir: fileURLToPath(new URL('../', import.meta.url)), contents: "export { querySceneNotifyMethods } from './api/scene-linkage'" },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'notification-request-boundary', setup(builder) {
    builder.onResolve({ filter: /^@jetlinks-web-core\/api\/notificationRecipients$/ }, () => ({ path: fileURLToPath(new URL('../../../jetlinks-web-core/src/api/notificationRecipients.ts', import.meta.url)) }))
    builder.onResolve({ filter: /^@jetlinks-web\/core$/ }, () => ({ path: 'request', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const request={get:(...args)=>globalThis.__sceneNotifyRequest(...args)}' }))
  } }],
})
const { querySceneNotifyMethods } = await import('data:text/javascript;base64,' + Buffer.from(api.outputFiles[0].text).toString('base64'))

test('真实渠道加载复用视觉告警能力，并合并同一凭据的并发查询', async t => {
  const calls = []
  const providers = [{ provider: 'scene', id: 'scene', channels: [
    { id: 'hook', channelProvider: 'notifier-webhook' },
    ...['robot-a', 'robot-b'].map(id => ({ id, channelProvider: 'notifier-dingTalk', channelConfiguration: { notifierId: 'robot/config' } })),
    { id: 'work', channelProvider: 'notifier-dingTalk', channelConfiguration: { notifierId: 'work' } },
  ] }]
  globalThis.__sceneNotifyRequest = async url => {
    calls.push(url)
    return { result: url === '/notify/channel/all' ? providers
      : { type: 'dingTalk', provider: url.endsWith('/work') ? 'dingTalkMessage' : 'dingTalkRobotWebHook' } }
  }
  t.after(() => delete globalThis.__sceneNotifyRequest)
  const methods = await querySceneNotifyMethods()
  assert.deepEqual(methods.map(method => [method.id, Boolean(method.fixedRecipient)]), [['hook', true], ['robot-a', true], ['robot-b', true], ['work', false]])
  assert.deepEqual(calls, ['/notify/channel/all', '/notifier/config/robot%2Fconfig', '/notifier/config/work'])
})

test('Webhook 无需凭据详情权限，钉钉保持人员选择', async t => {
  globalThis.__sceneNotifyRequest = async url => {
    if (url !== '/notify/channel/all') throw Error('forbidden')
    return { result: [{ provider: 'scene', id: 'scene', channels: [
      { id: 'hook', channelProvider: 'notifier-webhook' },
      { id: 'unknown', channelProvider: 'notifier-dingTalk', channelConfiguration: { notifierId: 'denied' } },
    ] }] }
  }
  t.after(() => delete globalThis.__sceneNotifyRequest)
  const methods = await querySceneNotifyMethods()
  assert.equal(requiresSceneNotifyRecipients(methods[0]), false)
  assert.equal(requiresSceneNotifyRecipients(methods[1]), true)
})


test('组织角色范围按渠道能力校验，缺少固定模板不能保存机器人', () => {
  const wechat = { id: 'wechat', channelProvider: 'notifier-weixin', recipientTypes: ['org', 'role'] }
  const ding = { id: 'ding', channelProvider: 'notifier-dingTalk', recipientTypes: ['org'] }
  for (const type of ['org', 'role']) {
    assert.equal(isSceneNotifyConfigured({ notifyChannelIds: ['wechat'], dimensions: [{type, id: 'target'}] }, [wechat]), true)
    assert.equal(isSceneNotifyConfigured({ notifyChannelIds: ['ding'], dimensions: [{type, id: 'target'}] }, [ding]), type === 'org')
  }
  assert.equal(isSceneNotifyConfigured({ notifyChannelIds: ['missing'], dimensions: [{type:'org', id:'x'}] }, []), false)
  assert.equal(isSceneNotifyConfigured({ notifyChannelIds: ['robot'] }, [{id:'robot',fixedRecipient:true}]), false)
})

test('渠道选择保存第三方关系开关，用户通知与组织角色使用相同配置入口', () => {
  const original = { userIds: ['user'], dimensions: [{ type: 'org', id: 'org' }, { type: 'role', id: 'role' }] }
  const wechat = { id: 'wechat', channelProvider: 'notifier-weixin', recipientTypes: ['org', 'role'] }
  const work = { id: 'work', channelProvider: 'notifier-dingTalk', recipientTypes: ['org'] }
  const robot = { id: 'robot', channelProvider: 'notifier-dingTalk', fixedRecipient: true }
  const inbox = { id: 'inbox', channelProvider: 'inside-mail' }
  assert.deepEqual(changeSceneNotifyMethod(original, wechat), {
    ...original, notifyChannelIds: ['wechat'], useThirdPartyRelation: true,
  })
  assert.deepEqual(changeSceneNotifyMethod(original, work).dimensions, [{ type: 'org', id: 'org' }])
  assert.equal(changeSceneNotifyMethod({ userIds: ['user'] }, wechat).useThirdPartyRelation, true)
  assert.deepEqual(changeSceneNotifyMethod(original, robot), {
    notifyChannelIds: ['robot'], userIds: [], dimensions: [], useThirdPartyRelation: false,
  })
  assert.deepEqual(changeSceneNotifyMethod(original, inbox), {
    notifyChannelIds: ['inbox'], userIds: ['user'], dimensions: [], useThirdPartyRelation: false,
  })
})
