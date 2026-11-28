import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { build } from 'esbuild'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const source = new URL('../views/Instance/RuleObservation.vue', import.meta.url)
const { descriptor } = parse(await readFile(source, 'utf8'), { filename: source.pathname })
const script = compileScript(descriptor, { id: 'rule-observation', inlineTemplate: true })
const temporary = new URL(`../.rule-observation-test-${process.pid}.mjs`, import.meta.url)
const result = await build({ stdin: { contents: script.content, loader: 'ts', resolveDir: new URL('../views/Instance/', import.meta.url).pathname },
  bundle: true, write: false, platform: 'node', format: 'esm', external: ['vue', 'dayjs'], plugins: [{ name: 'ui-boundaries', setup(b) {
    b.onResolve({ filter: /^(vue-i18n|ant-design-vue)$/ }, args => ({ path: args.path, namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'vue-i18n'
      ? 'export const useI18n=()=>({t:key=>key})'
      : 'export const theme={useToken:()=>({token:{value:{colorSuccess:"green",colorWarning:"orange",colorTextTertiary:"gray"}}})}' }))
  } }] })
await writeFile(temporary, result.outputFiles[0].text)
const { default: Observation } = await import(temporary.href)
await rm(temporary)
const render = props => {
  const app = createSSRApp(Observation, { loading:false, stale:false, failed:false, ...props })
  app.component('AIcon', { props:['type'], setup:props=>()=>h('i', {'data-icon':props.type}) })
  app.component('APopover', { setup:(_, {slots})=>()=>h('div', [slots.default?.(), slots.content?.()]) })
  app.component('ASkeletonInput', { render:()=>h('span','loading') })
  return renderToString(app)
}
const runtime = { id:'rule', observationStatus:'partial', runtimeState:'unknown', runningReplicas:2, totalReplicas:3,
  inputRate:12.5, outputRate:3.5, buffered:'2', transferCount:'9007199254740993', errorCount:'1' }
const trigger = html => html.match(/<button\b[^>]*class="rule-observation"[\s\S]*?<\/button>/)?.[0] || ''

test('partial coverage renders observed values with warning and preserves the exact transfer count', async () => {
  const html = await render({ runtime })
  assert.match(html, /data-icon="WarningOutlined"/)
  assert.match(trigger(html), /data-icon="WarningOutlined"/)
  assert.match(html, /12\.5<small>\/s/)
  assert.match(html, /3\.5<small>\/s/)
  assert.ok(html.includes('9007199254740993'))
  assert.ok(html.includes('RuleInstanceList.partialHelp'))
  assert.ok(html.includes('RuleInstanceList.observedReplicas'))
  assert.ok(html.includes('2/3'))
})
test('expired or unavailable observations never present retained numbers as current', async () => {
  for (const props of [{stale:true,runtime},{runtime:{...runtime,observationStatus:'unavailable'}}]) {
    const html=await render(props)
    assert.equal(html.includes('12.5'),false)
    assert.equal(html.includes('9007199254740993'),false)
  }
})
test('a measured zero remains visible', async () => {
  const html=await render({runtime:{...runtime,observationStatus:'ready',runtimeState:'running',inputRate:0,outputRate:0,transferCount:'0'}})
  assert.match(html,/data-icon="PlayCircleOutlined"/)
  assert.ok((html.match(/0<small>\/s/g)||[]).length>=2)
})
test('healthy summaries omit the duplicate run icon while details and attention states keep theirs', async () => {
  const healthy = await render({runtime:{...runtime,observationStatus:'ready',runtimeState:'running'}})
  assert.doesNotMatch(trigger(healthy), /data-icon="PlayCircleOutlined"/)
  assert.match(healthy, /data-icon="PlayCircleOutlined"/)
  assert.match(trigger(healthy), /aria-label="[^"]*RuleInstanceList.status.running/)
  for (const [props, icon] of [[{loading:true,runtime},'SyncOutlined'],
    [{runtime:{...runtime,observationStatus:'ready',runtimeState:'paused'}},'PauseCircleOutlined'],
    [{stale:true,runtime},'QuestionCircleOutlined']]) {
    assert.match(trigger(await render(props)),new RegExp(`data-icon="${icon}"`))
  }
})
