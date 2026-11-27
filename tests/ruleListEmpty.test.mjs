import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createI18n } from 'vue-i18n'

const root = new URL('..', import.meta.url).pathname
const core = process.env.JETLINKS_WEB_CORE_ROOT || resolve(root, '../../jetlinks-web-core')
const result = await build({ stdin: { resolveDir: root, contents: "export {default as RuleListEmpty} from './views/Instance/RuleListEmpty.vue'; export {ruleListMessages} from './views/Instance/listMessages'" }, bundle: true, write: false, format: 'esm', platform: 'node', external: ['vue', 'vue-i18n'], plugins: [{ name: 'real-empty-components', setup(b) {
  b.onResolve({ filter: /^@jetlinks-web-core\// }, args => { const file = resolve(core, 'src', args.path.slice('@jetlinks-web-core/'.length)); return { path: existsSync(file) ? file : `${file}.ts` } })
  b.onLoad({ filter: /\.vue$/ }, async args => { const { descriptor } = parse(await readFile(args.path, 'utf8'), { filename: args.path }); return { contents: compileScript(descriptor, { id: 'rule-list-empty', inlineTemplate: true }).content, loader: 'ts' } })
  b.onLoad({ filter: /\.svg$/ }, () => ({ contents: "export default 'empty.svg'", loader: 'js' }))
} }] })
const temporary = new URL(`../.rule-empty-test-${process.pid}.mjs`, import.meta.url)
await writeFile(temporary, result.outputFiles[0].text)
let api
try { api = await import(temporary.href) } finally { await rm(temporary) }
const dictionaries = Object.fromEntries(await Promise.all(['zh', 'en', 'ja'].map(async lang => [lang, {
  ...JSON.parse(await readFile(resolve(core, `src/locales/lang/${lang}.json`), 'utf8')),
  ...JSON.parse(await readFile(resolve(root, `locales/lang/${lang}.json`), 'utf8')),
}])))

async function render(locale, search = []) {
  const events = [], buttons = []
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', flatJson: true, missingWarn: false, fallbackWarn: false, messages: dictionaries })
  const app = createSSRApp(api.RuleListEmpty, { permissionKey: 'rule-engine/Instance', search,
    onTemplates: () => events.push('templates'), onBlank: () => events.push('blank'), onClearSearch: () => events.push('clear-search') })
  const Button = defineComponent({ inheritAttrs: false, props: ['hasPermission'], setup(props, { slots, attrs }) {
    return () => {
      const children = slots.default?.() || []
      const label = children.map(node => typeof node.children === 'string' ? node.children : '').join('')
      buttons.push({ label, permission: props.hasPermission, click: attrs.onClick })
      return h('button', { type: 'button' }, children)
    }
  } })
  app.use(i18n)
  app.component('j-permission-button', Button).component('a-button', Button)
  app.component('a-space', defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }))
  app.component('a-empty', defineComponent({ props: ['description', 'image', 'imageStyle'], setup: (props, { slots }) => () => h('div', [h('div', slots.description?.() || props.description), slots.default?.()]) }))
  return { html: await renderToString(app), events, buttons, t: i18n.global.t }
}

test('first-rule guidance localizes both creation routes and retains the add permission', async () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const view = await render(lang)
    const messages = api.ruleListMessages[lang].RuleInstanceList
    for (const key of ['emptyTitle', 'emptyDescription', 'createHint']) assert.ok(view.html.includes(messages[key]))
    assert.doesNotMatch(view.html, /RuleInstanceList\./)
    assert.deepEqual(view.events, [])
    assert.deepEqual(view.buttons.map(button => button.permission), ['rule-engine/Instance:add', 'rule-engine/Instance:add'])
    view.buttons.find(button => button.label === messages.createFromTemplate).click()
    view.buttons.find(button => button.label === messages.createBlank).click()
    assert.deepEqual(view.events, ['templates', 'blank'])
  }
})

test('submitted filters replace first-use guidance with the platform no-results state and clear action', async () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const view = await render(lang, [{ column: 'name', value: 'missing' }])
    const messages = api.ruleListMessages[lang].RuleInstanceList
    const emptyMessage = view.t('components.CloudEmpty.searchEmpty', { name: view.t('EmptyCreate.names.rules') })
    assert.ok(view.html.includes(emptyMessage))
    assert.equal(view.html.includes(messages.emptyTitle), false)
    assert.equal(view.html.includes(messages.createFromTemplate), false)
    assert.equal(view.html.includes(messages.createBlank), false)
    assert.equal(view.buttons.length, 1)
    assert.equal(view.buttons[0].label, messages.clearSearch)
    view.buttons[0].click()
    assert.deepEqual(view.events, ['clear-search'])
  }
})
