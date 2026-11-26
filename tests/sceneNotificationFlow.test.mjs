import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { effectScope, reactive, ref } from 'vue'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const bundle = await build({
  entryPoints: [root + 'views/SceneLinkage/editor/useSceneNotification.ts'],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['vue'],
  plugins: [{ name: 'notification-boundaries', setup(builder) {
    builder.onResolve({ filter: /api\/scene-linkage$/ }, () => ({ path: 'api', namespace: 'fixture' }))
    builder.onResolve({ filter: /^@jetlinks-web-core\/hooks\/useNotificationConfigNavigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'api'
      ? 'export const querySceneNotifyChannels=()=>ctx.channels(); export const querySceneNotifyChannelTemplates=id=>ctx.templates(id);'
      : 'export const useNotificationConfigNavigation=refresh=>({available:ctx.available,open:(...args)=>ctx.navigation.push(args)});' }))
  } }],
})
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const email = { id: 'email', name: 'Email', channelProvider: 'notifier-email', providerId: 'scene-provider' }
const inside = { id: 'site', name: 'Inside', channelProvider: 'inside-mail', providerId: 'scene-provider' }
const result = (id, text) => ({ success: true, result: { channels: [{ channel: { id }, template: { template: { text } } }] } })
function mount(t, options = {}) {
  const ctx = { navigation: [], available: ref(true), channels: async () => ({ result: [{ provider: 'scene', id: 'scene-provider', channels: [email, inside] }] }), templates: async () => result('email', 'saved'), ...options }
  const mod = new Module(root + 'scene-flow.cjs')
  mod.paths = require.resolve.paths('vue')
  mod._compile('module.exports=(ctx)=>{const exports={};' + bundle.outputFiles[0].text.replaceAll('module.exports', 'exports.result') + ';return exports.result}', root + 'scene-flow.cjs')
  const form = reactive({ actions: [{ type: 'sceneNotify', config: { notifyChannelIds: ['email'], userIds: ['user'], legacy: 'keep' }, options: {} }] })
  const scope = effectScope()
  const hook = scope.run(() => mod.exports(ctx).useSceneNotification(form))
  t.after(() => scope.stop())
  return { hook, ctx, form, scope }
}

test('站内信不查询模板；配置返回刷新保持接收人和业务草稿', async t => {
  let queries = 0
  const { hook, form } = mount(t, { templates: async () => { queries++; return result('email', 'saved') } })
  await hook.refreshNotifyTemplate(0, inside, true)
  assert.equal(queries, 0)
  assert.deepEqual(form.actions[0].config, { notifyChannelIds: ['site'], userIds: ['user'], legacy: 'keep' })
  await hook.refreshTemplates()
  assert.equal(form.actions[0].options.templateContent, '')
  assert.equal(hook.templateState(form.actions[0]), 'ready')
  assert.equal(queries, 0)
})

test('快速外部渠道切站内信和移除行后，迟到预览都不能覆盖当前草稿', async t => {
  const pending = deferred()
  const { hook, form } = mount(t, { templates: () => pending.promise })
  const loading = hook.refreshNotifyTemplate(0, email, true)
  await hook.refreshNotifyTemplate(0, inside, true)
  pending.resolve(result('email', 'late email'))
  await loading
  assert.equal(form.actions[0].options.templateContent, '')
  assert.deepEqual(form.actions[0].config.notifyChannelIds, ['site'])
  const removed = form.actions[0]
  const pendingRemoval = deferred()
  const other = mount(t, { templates: () => pendingRemoval.promise })
  const removedAction = other.form.actions[0]
  const loadingRemoval = other.hook.refreshNotifyTemplate(0, email)
  other.form.actions.splice(0, 1)
  pendingRemoval.resolve(result('email', 'removed'))
  await loadingRemoval
  assert.equal(removedAction.options.templateContent, '')
  assert.equal(removed.config.legacy, 'keep')
})

test('查询失败单独呈现，重试恢复，配置跳转传递真实渠道', async t => {
  const { hook, ctx, form } = mount(t)
  await hook.refreshTemplates()
  ctx.channels = async () => ({ success: false, status: 403 })
  await hook.refreshTemplates()
  assert.equal(hook.notifyMethodsFailed.value, true)
  assert.equal(hook.notifyMethods.value.length, 2)
  ctx.templates = async () => ({ success: false, status: 500 })
  await hook.refreshNotifyTemplate(0, email)
  assert.equal(hook.templateState(form.actions[0]), 'failed')
  ctx.templates = async () => result('email', 'recovered')
  await hook.refreshNotifyTemplate(0, email)
  assert.equal(hook.templateState(form.actions[0]), 'ready')
  assert.equal(form.actions[0].options.templateContent, 'recovered')
  hook.configureNotification(form.actions[0])
  assert.deepEqual(ctx.navigation, [['scene', 'notifier-email']])
})
