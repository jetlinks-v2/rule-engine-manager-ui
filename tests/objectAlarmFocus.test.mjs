import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { defineComponent, h, reactive } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, sourceRoot } from './helpers/metricRuntime.mjs'

test('alarm focus validates persisted IDs, retains selected search options and bounds edits without losing other parameters', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let requests = 0
  const load = createMetricLoader({
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    [resolve(sourceRoot, 'api/configuration.ts')]: {
      queryList: async () => ({
        success: true,
        result: { data: (++requests === 1 ? ['keep', 'drop'] : ['new']).map(id => ({ id, name: id })) }
      })
    }
  })
  const Focus = load('views/Alarm/Log/components/ObjectAlarmFocus.vue').default
  const parameters = reactive({ alarmConfigIds: {}, state: 'warning' })
  const changes = []
  let select
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp(() => h(Focus, { parameters, onChange: value => changes.push(value) }))
  app.component('a-select', defineComponent({
    inheritAttrs: false,
    props: ['value', 'options'],
    emits: ['change', 'search'],
    setup(props, { emit }) { select = { props, emit }; return () => null }
  }))
  app.component('a-alert', () => null)
  app.mount(root)
  t.after(() => app.unmount())
  await flush()
  assert.deepEqual(select.props.value, [])
  parameters.alarmConfigIds = ['keep', 17, null, 'other']
  await flush()
  assert.deepEqual(select.props.value, ['keep', 'other'])
  select.emit('search', 'new')
  t.mock.timers.tick(250)
  await flush()
  assert.deepEqual(select.props.options.map(option => option.value), ['keep', 'new'])
  select.emit('change', [null, 17, ...Array.from({ length: 25 }, (_, index) => `rule-${index}`)])
  assert.deepEqual(changes, [{ state: 'warning', alarmConfigIds: Array.from({ length: 20 }, (_, index) => `rule-${index}`) }])
  assert.deepEqual(parameters.alarmConfigIds, ['keep', 17, null, 'other'])
})
