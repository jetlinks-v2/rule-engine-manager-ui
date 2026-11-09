import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const { outputFiles } = await build({
  stdin: {
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    contents: `
      export * from './utils/sceneNotify';
      export { canReceiveProfileBackedNotification } from './utils/notifyUser';
    `,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
})

const {
  canReceiveProfileBackedNotification,
  requiresSceneNotifyTemplate,
  toSceneNotifyMethods,
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
