import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const { createRenderer, h, nextTick, reactive, ref } = require('vue')
const { parse, compileScript } = require('vue/compiler-sfc')
const root = resolve(import.meta.dirname, '..')
const stubs = {
  '@jetlinks-web-core/components/DocumentHelp': 'export default () => null',
  '@jetlinks-web-core/store': `
    export const useAIStore = () => ({ agentList: [], prepareAgentConversation() {}, releaseAgentConversation() {} });
    export const useAuthStore = () => ({ hasPermission: code => globalThis.ruleEditorPermissionFixture.permissions.has(code) });
  `,
  '@jetlinks-web-core/utils': 'export const getBaseApi = () => ""; export const isFromCloud = () => false',
  '@jetlinks-web/utils': 'export const onlyMessage = (...args) => globalThis.ruleEditorPermissionFixture.messages.push(args)',
  'vue-i18n': 'export const useI18n = () => ({ t: key => key })',
  './ruleEditorAgentProfile': 'export const RULE_EDITOR_BUILTIN_TOOL_GROUPS = []; export const appendRuleEditorTurnAdmission = value => value',
  './toolRuntimeContracts': 'export const RULE_EDITOR_RESOURCE_VERSION = "test"',
  './useRuleEditorAgentComposerExtensions': `import { ref } from 'vue';
    export const useRuleEditorAgentComposerExtensions = () => ({ referenceProviders: ref([]), composerAddActions: ref([]) })`,
  './useRuleEditorAgentBridge': `export const useRuleEditorAgentBridge = () => globalThis.ruleEditorPermissionFixture.bridge`,
  '../../../api/instance': `
    export const modify = async (...args) => { globalThis.ruleEditorPermissionFixture.writes.push(args); return { status: 200 } };
    export const updateRuleMetadata = async () => { throw new Error('Unexpected metadata update') };
  `,
}
const output = await build({
  entryPoints: [resolve(root, 'views/Instance/RuleEditor/index.vue')],
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['vue'],
  plugins: [{ name: 'drawer-platform-boundaries', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'platform' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'platform' }, args => ({ contents: stubs[args.path] }))
    builder.onResolve({ filter: /^@rule-engine-manager-ui\/hook\/usePermission$/ }, () => ({ path: resolve(root, 'hook/usePermission.ts') }))
    builder.onLoad({ filter: /hook\/usePermission\.ts$/ }, async args => ({
      // 与宿主的 Vue 自动导入一致，保留真实的菜单上下文选择逻辑。
      contents: "import { inject, provide } from 'vue';\n" + await readFile(args.path, 'utf8'), loader: 'ts',
    }))
    builder.onLoad({ filter: /\.vue$/ }, async args => {
      const { descriptor, errors } = parse(await readFile(args.path, 'utf8'), { filename: args.path })
      assert.deepEqual(errors, [])
      return { contents: compileScript(descriptor, { id: args.path, inlineTemplate: true }).content, loader: 'ts' }
    })
  } }],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports)
const Drawer = module.exports.default
const node = (type, text = '') => ({ type, text, props: {}, children: [], parent: null })
const renderer = createRenderer({
  createElement: type => node(type), createText: text => node('text', text), createComment: () => node('comment'),
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    const index = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
    child.parent = parent
  },
  remove(child) { if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1) },
  setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.text = text; el.children = [] },
  patchProp: (el, key, _, value) => { el.props[key] = value }, parentNode: el => el.parent,
  nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] || null,
})
const find = (el, predicate) => [el, ...el.children.flatMap(child => find(child, predicate))].filter(predicate)
const byClass = (root, name) => find(root, el => el.props.class?.split(' ').includes(name))[0]
const flush = async () => { await nextTick(); await Promise.resolve(); await nextTick() }

function mount(t, grants, menuCode) {
  const previousWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://drawer.test' }, setTimeout, clearTimeout }
  const state = {
    permissions: reactive(new Set(grants.map(action => `${menuCode || 'rule-engine/Instance'}:${action}`))),
    calls: [], writes: [], messages: [],
    bridge: {
      iframeRef: ref(), ready: ref(false), status: ref('ready'), context: ref({ actions: {} }), version: ref('test'),
      reset() {}, disposeBridge() {},
      async executeEditorAction(action) { state.calls.push(action); return { ok: true } },
      async executeEditorUtilityAction(action) { state.calls.push(action); return { ok: true } },
    },
  }
  globalThis.ruleEditorPermissionFixture = state
  const app = renderer.createApp({ render: () => h(Drawer, { open: true, rule: { id: 'rule-1', name: 'Rule', description: 'Description' } }) })
  if (menuCode) app.provide('rule-permission-key', menuCode)
  for (const name of ['a-drawer', 'a-space', 'a-button-group', 'a-tooltip']) {
    app.component(name, { setup: (_, ctx) => () => h('div', ctx.slots.default?.()) })
  }
  app.component('a-button', { setup: (_, ctx) => () => h('button', ctx.attrs, ctx.slots.default?.()) })
  for (const name of ['a-input', 'a-textarea']) {
    app.component(name, {
      props: ['value'], emits: ['update:value', 'blur'],
      setup: (props, { emit }) => () => h('input', {
        value: props.value, onInput: value => emit('update:value', value), onBlur: () => emit('blur'),
      }),
    })
  }
  app.component('a-modal', {
    props: ['open'], emits: ['ok', 'cancel'],
    setup: (props, { slots, emit }) => () => props.open ? h('section', {}, [
      slots.default?.(), h('button', { 'data-confirm': true, onClick: () => emit('ok') }),
    ]) : null,
  })
  for (const name of ['AIcon', 'a-spin']) app.component(name, () => null)
  const container = node('root')
  app.config.globalProperties.$t = key => key
  app.mount(container)
  t.after(() => { app.unmount(); globalThis.window = previousWindow; delete globalThis.ruleEditorPermissionFixture })
  const controls = () => ({
    name: byClass(container, 'rule-editor-shell__name'),
    description: byClass(container, 'rule-editor-shell__description'),
    save: byClass(container, 'rule-editor-shell__action--save'),
    deploy: byClass(container, 'rule-editor-shell__action--deploy'),
    import: find(container, el => el.props.title === 'RuleEditor.index.importDescription')[0],
    export: find(container, el => el.props.title === 'RuleEditor.index.exportDescription')[0],
  })
  return { state, container, controls }
}

test('menu declares separate import and export buttons with the required backend permission sets', async () => {
  const menus = JSON.parse(await readFile(resolve(root, 'baseMenu.json'), 'utf8'))
  const menu = menus.flatMap(item => item.children || []).find(item => item.code === 'rule-engine/Instance')
  assert.ok(menu)
  assert.equal(new Set(menu.buttons.map(button => button.id)).size, menu.buttons.length)
  for (const [id, source, name] of [['import', 'update', '导入'], ['export', 'view', '导出']]) {
    const button = menu.buttons.find(button => button.id === id)
    assert.equal(button?.name, name)
    assert.deepEqual(button.permissions, menu.buttons.find(button => button.id === source).permissions)
    for (const locale of ['zh_CN', 'en_US', 'en', 'ja', 'ja_JP']) assert.ok(button.i18nMessages[locale])
  }
})

for (const grants of [[], ['view'], ['update'], ['action'], ['import'], ['export'], ['view', 'update', 'action'], ['view', 'update', 'action', 'import', 'export']]) {
  test(`real drawer renders permission states and blocks denied events: ${grants.join(',') || 'none'}`, async t => {
    const { state, controls, container } = mount(t, grants)
    const required = { name: 'update', description: 'update', save: 'update', deploy: 'action', import: 'import', export: 'export' }
    for (const [name, permission] of Object.entries(required)) {
      assert.equal(controls()[name].props.disabled, !grants.includes(permission), name)
      if (name === 'name' || name === 'description') {
        if (!grants.includes(permission)) {
          controls()[name].props.onClick()
          await flush()
          assert.equal(find(container, el => el.type === 'input').length, 0)
        }
        continue
      }
      // 直接调用事件也必须在 action hook 被拦截，不能只依赖原生 disabled。
      controls()[name].props.onClick()
      await flush()
    }
    assert.deepEqual(state.calls, ['save', 'deploy', 'import', 'export'].filter(name => grants.includes(required[name])))
    state.permissions.clear()
    await flush()
    for (const control of Object.values(controls())) assert.equal(control.props.disabled, true)
    assert.deepEqual(state.messages, [])
  })
}

for (const field of ['name', 'description']) {
  test(`${field} editing exits on revoked permission and stale submit cannot write`, async t => {
    const { state, controls, container } = mount(t, ['update'])
    controls()[field].props.onClick()
    await flush()
    const input = find(container, el => el.type === 'input')[0]
    input.props.onInput('Changed')
    await flush()
    const submit = field === 'name' ? input.props.onBlur
      : find(container, el => el.props['data-confirm'])[0].props.onClick
    state.permissions.clear()
    await flush()
    assert.equal(find(container, el => el.type === 'input').length, 0)
    submit()
    await flush()
    assert.deepEqual(state.writes, [])
    state.permissions.add('rule-engine/Instance:update')
    await flush()
    controls()[field].props.onClick()
    await flush()
    const nextInput = find(container, el => el.type === 'input')[0]
    assert.equal(nextInput.props.value, field === 'name' ? 'Rule' : 'Description')
    nextInput.props.onInput('Allowed change')
    await flush()
    if (field === 'name') nextInput.props.onBlur()
    else find(container, el => el.props['data-confirm'])[0].props.onClick()
    await flush()
    assert.deepEqual(state.writes, [['rule-1', { id: 'rule-1', name: field === 'name' ? 'Allowed change' : 'Rule', description: field === 'description' ? 'Allowed change' : 'Description' }]])
  })
}

test('drawer uses injected menu context and preserves bridge availability and busy guards', async t => {
  const { state, controls } = mount(t, ['view', 'update', 'action', 'import', 'export'], 'custom-rule')
  state.permissions.clear()
  state.permissions.add('rule-engine/Instance:update')
  await flush()
  assert.equal(controls().save.props.disabled, true)
  state.permissions.add('custom-rule:update')
  state.permissions.add('custom-rule:import')
  await flush()
  assert.equal(controls().save.props.disabled, false)
  state.bridge.context.value.actions.save = false
  await flush()
  assert.equal(controls().save.props.disabled, true)
  state.bridge.context.value.actions.save = true
  state.bridge.status.value = 'loading'
  await flush()
  assert.equal(controls().import.props.disabled, true)
  state.bridge.status.value = 'ready'
  let finish
  state.bridge.executeEditorUtilityAction = () => new Promise(resolve => { finish = resolve })
  controls().import.props.onClick()
  await flush()
  for (const name of ['save', 'deploy', 'import', 'export']) assert.equal(controls()[name].props.disabled, true)
  controls().save.props.onClick()
  assert.deepEqual(state.calls, [])
  finish({ ok: true })
  await flush()
  assert.equal(controls().save.props.disabled, false)
})
