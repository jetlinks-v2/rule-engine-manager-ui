import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { effectScope, reactive, ref, nextTick } from 'vue'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const bundle = await build({
  entryPoints: [root + 'views/SceneLinkage/editor/useSceneNotification.ts'],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['vue'],
  plugins: [{ name: 'notification-boundaries', setup(builder) {
    builder.onResolve({ filter: /^@jetlinks-web-core\/api\/notificationRecipients$/ }, () => ({ path: 'directory', namespace: 'fixture' }))
    builder.onResolve({ filter: /api\/scene-linkage$/ }, () => ({ path: 'api', namespace: 'fixture' }))
    builder.onResolve({ filter: /^@jetlinks-web-core\/hooks\/useNotificationConfigNavigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'directory' ? 'export const queryNotificationRecipientDirectory=kind=>ctx.directory(kind)' : path === 'api'
      ? 'export const querySceneNotifyChannels=()=>ctx.channels(); export const querySceneNotifyChannelTemplates=id=>ctx.templates(id);'
      : 'export const useNotificationConfigNavigation=refresh=>({available:ctx.available,open:(...args)=>ctx.navigation.push(args)});' }))
  } }],
})
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const email = { id: 'email', name: 'Email', channelProvider: 'notifier-email', providerId: 'scene-provider' }
const inside = { id: 'site', name: 'Inside', channelProvider: 'inside-mail', providerId: 'scene-provider' }
const result = (id, text) => ({ success: true, result: { channels: [{ channel: { id }, template: { template: { text } } }] } })
function mount(t, options = {}) {
  const ctx = { directory: async () => [], navigation: [], available: ref(true), channels: async () => ({ result: [{ provider: 'scene', id: 'scene-provider', channels: [email, inside] }] }), templates: async () => result('email', 'saved'), ...options }
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


test('组织角色目录按需加载、失败重试且切换类型保留已选范围', async t => {
  const { ctx, form, scope } = mount(t)
  let fail = true
  ctx.directory = async kind => { if (fail) throw Error('offline'); return [{id:'org-1',name:'总部'}] }
  const mod = new Module(root + 'scene-recipients.cjs')
  mod.paths = require.resolve.paths('vue')
  mod._compile('module.exports=(ctx)=>{const exports={};' + bundle.outputFiles[0].text.replaceAll('module.exports', 'exports.result') + ';return exports.result}', root + 'scene-recipients.cjs')
  const method = ref({recipientTypes:['org','role']})
  const visible = ref(true)
  const hook = scope.run(() => mod.exports(ctx).useSceneNotifyRecipients(() => form.actions[0], () => method.value, () => visible.value))
  hook.kind.value = 'org'
  await nextTick(); await nextTick()
  assert.equal(hook.directory.value.status,'error')
  fail = false; hook.retry(); await nextTick(); await nextTick()
  assert.equal(hook.directory.value.status,'ready')
  Object.assign(form.actions[0], hook.change(['org-1']))
  assert.deepEqual(form.actions[0].config.dimensions,[{type:'org',id:'org-1'}])
  assert.equal(form.actions[0].options.recipientScopes[0].name,'总部')
  hook.kind.value = 'role'; await nextTick(); await nextTick()
  Object.assign(form.actions[0], hook.change(['role-1']))
  assert.deepEqual(form.actions[0].config.dimensions,[{type:'org',id:'org-1'},{type:'role',id:'role-1'}])
  form.actions[0].config.userIds = []
  visible.value = false; await nextTick()
  visible.value = true; await nextTick()
  assert.equal(hook.kind.value,'org')
  assert.equal(hook.scopeNames.value[0].name,'总部')
  method.value = {recipientTypes:[]}; await nextTick()
  assert.equal(hook.kind.value,'people')
})

test('预览移除只影响当前渠道和对象类型，最后一项移除后保留空目标供必填校验', async t => {
  const { ctx, form, scope } = mount(t)
  form.actions[0].config = { notifyChannelIds: ['wechat'], userIds: ['same'], dimensions: [{type:'org',id:'same'}, {type:'role',id:'same'}] }
  form.actions[0].options = { recipientScopes: [{type:'org',id:'same',name:'部门'}, {type:'role',id:'same',name:'标签'}] }
  form.actions.push({type:'sceneNotify',config:{notifyChannelIds:['ding'],dimensions:[{type:'org',id:'same'}]},options:{}})
  const sibling = structuredClone(JSON.parse(JSON.stringify(form.actions[1])))
  const mod = new Module(root + 'scene-remove-recipients.cjs')
  mod.paths = require.resolve.paths('vue')
  mod._compile('module.exports=(ctx)=>{const exports={};' + bundle.outputFiles[0].text.replaceAll('module.exports', 'exports.result') + ';return exports.result}', root + 'scene-remove-recipients.cjs')
  const hook = scope.run(() => mod.exports(ctx).useSceneNotifyRecipients(() => form.actions[0], () => ({recipientTypes:['org','role']}), () => false))
  Object.assign(form.actions[0], hook.remove('org','same'))
  assert.deepEqual(form.actions[0].config.dimensions,[{type:'role',id:'same'}])
  assert.deepEqual(form.actions[0].config.userIds,['same'])
  assert.deepEqual(form.actions[0].options.recipientScopes,[{type:'role',id:'same',name:'标签'}])
  Object.assign(form.actions[0], hook.remove('people','same'))
  assert.deepEqual(form.actions[0].config.userIds,[])
  assert.deepEqual(form.actions[0].config.dimensions,[{type:'role',id:'same'}])
  Object.assign(form.actions[0], hook.remove('role','same'))
  assert.deepEqual(form.actions[0].config.dimensions,[])
  assert.deepEqual(JSON.parse(JSON.stringify(form.actions[1])),sibling)
})
