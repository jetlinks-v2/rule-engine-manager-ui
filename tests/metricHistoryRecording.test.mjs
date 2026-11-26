import assert from 'node:assert/strict'
import test from 'node:test'
import { h, reactive } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ 'vue-i18n': { useI18n: () => ({ t: key => key }) } })
const Editor = load('components/Metric/template/HistoryRecordingEditor.vue').default

function mount(disabled = false) {
  const output = reactive({ metricId: 'value', unit: 'kWh' }), changes = []
  const view = createMetricRenderer(), app = view.renderer.createApp({ render: () => h(Editor, {
    output, disabled, onPatch: patch => { changes.push(patch); Object.assign(output, patch) },
  }) })
  app.config.warnHandler = () => {}
  app.mount(view.root)
  const field = label => walk(view.root, node => node.type === 'external-shell'
    && node.props['component-props']?.['aria-label'] === label)[0]
  return { ...view, output, changes, field, close: () => app.unmount() }
}

test('历史策略按需展开参数，切换保留输出身份和单位，明确间隔只检查新结果', async () => {
  const view = mount()
  try {
    const choose = value => view.field('historyRecording').props.onChange(value)
    choose('onChange'); await flush()
    assert.deepEqual({ ...view.output.history }, { mode: 'onChange', deadband: 0, intervalMillis: 0, maxIntervalMillis: 60000 })
    view.field('historyDeadband').props.onChange(2); await flush()
    assert.equal(view.output.history.deadband, 2)
    choose('interval'); await flush()
    assert.equal(view.output.history.intervalMillis, 60000)
    assert.ok(textContent(view.root).includes('historyRecordingIntervalHint'))
    assert.equal(view.field('historyDeadband'), undefined)
    choose('latest'); await flush()
    assert.equal(view.output.persist, false); assert.equal(view.output.latestOnly, true)
    assert.equal(view.output.history, undefined)
    choose('all'); await flush()
    assert.equal(view.output.persist, true); assert.equal(view.output.latestOnly, false)
    assert.equal(view.output.history, undefined)
    assert.equal(view.output.metricId, 'value'); assert.equal(view.output.unit, 'kWh')
  } finally { view.close() }
})

test('只读编辑不接受策略或死区修改', async () => {
  const view = mount(true)
  try {
    view.output.history = { mode: 'onChange', deadband: 1, intervalMillis: 0, maxIntervalMillis: 0 }
    await flush()
    view.field('historyRecording').props.onChange('latest')
    view.field('historyDeadband').props.onChange(10)
    assert.equal(view.changes.length, 0)
    assert.equal(view.output.history.deadband, 1)
  } finally { view.close() }
})
