import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const vue = require('vue')
const { createI18n } = require('vue-i18n')
const root = fileURLToPath(new URL('../', import.meta.url))
const messages = Object.fromEntries(
  await Promise.all(
    ['zh', 'en'].map(async (locale) => [
      locale,
      JSON.parse(await readFile(new URL(`../locales/lang/${locale}.json`, import.meta.url), 'utf8'))
    ])
  )
)
const compiled = await build({
  stdin: {
    resolveDir: root,
    loader: 'ts',
    contents: `
    export * from './views/Alarm/Log/utils/alarmPresentation';
    export * from './views/Alarm/Log/hooks/useAlarmRecordPresentation';
  `
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external'
})
const i18n = createI18n({ legacy: false, locale: 'zh', messages })
const loaded = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  (name) => (name === 'vue-i18n' ? { useI18n: () => i18n.global } : require(name)),
  loaded,
  loaded.exports
)
const { alarmFacts, alarmTime, formatAlarmDuration, useAlarmRecordPresentation } = loaded.exports
const first = 1793166035000,
  last = first + 86400000 + 370000,
  end = first + 86400000 + 595000
const record = {
  alarmTime: first,
  lastAlarmTime: last,
  handleTime: end,
  state: { value: 'normal', text: '无告警' },
  handleType: { value: 'user', text: '人工' }
}

test('ended rounds use the first trigger through handling and retain the latest trigger separately', () => {
  const facts = alarmFacts(record, false, end + 100000)
  assert.deepEqual(facts.duration, { from: first, to: end, kind: 'ended' })
  assert.deepEqual(
    facts.timeline.map((moment) => moment.kind),
    ['first', 'latest', 'handled']
  )
  assert.deepEqual(facts.timeline[1].span, { from: first, to: last, kind: 'elapsed' })
  assert.equal(facts.handleType, '人工')
})

test('ongoing rounds ignore old handling and only their current endpoint advances', () => {
  const current = { ...record, state: 'warning', handleTime: first - 1 }
  const a = alarmFacts(current, false, end),
    b = alarmFacts(current, false, end + 60000)
  assert.equal(a.end, undefined)
  assert.deepEqual(a.timeline.slice(0, 2), b.timeline.slice(0, 2))
  assert.equal(b.duration.to - a.duration.to, 60000)
  assert.equal(b.timeline.at(-1).kind, 'current')
})

test('historical triggers use their own cycle and never inherit current aggregate state', () => {
  const occurrence = { ...record, alarmTime: last, cycleTime: first }
  const a = alarmFacts(occurrence, true, end),
    b = alarmFacts(occurrence, true, end + 86400000)
  assert.deepEqual(a, b)
  assert.deepEqual(a.duration, { from: first, to: last, kind: 'elapsed' })
  assert.equal(a.state.value, '')
  assert.deepEqual(
    a.timeline.map((moment) => moment.kind),
    ['triggered']
  )
  assert.equal(alarmFacts({ alarmTime: last }, true, end).duration, undefined)
  assert.equal(alarmFacts({ alarmTime: last, cycleTime: last + 1 }, true, end).duration, undefined)
  assert.equal(alarmFacts({ alarmTime: end, cycleTime: last }, true, end).duration.from, last)
})

test('unknown, invalid and inverted times cannot fabricate durations; identical triggers are merged', () => {
  for (const invalid of [undefined, null, '', ' ', 0, '0', -1, 'invalid', NaN]) {
    assert.equal(alarmTime(invalid), undefined)
    assert.equal(alarmFacts({ ...record, alarmTime: invalid }, false, end).duration, undefined)
  }
  assert.equal(alarmTime(String(first)), first)
  for (const handleTime of [undefined, 0, first - 1, last - 1])
    assert.equal(alarmFacts({ ...record, handleTime }, false, end).duration, undefined)
  assert.equal(alarmFacts({ ...record, state: 'warning' }, false, first - 1).duration, undefined)
  const zero = alarmFacts({ ...record, lastAlarmTime: first, handleTime: first }, false, end)
  assert.deepEqual(
    zero.timeline.map((moment) => moment.kind),
    ['first', 'handled']
  )
  assert.equal(zero.duration.to - zero.duration.from, 0)
})

test('localized durations retain long rounds and exact seconds without negative or unknown values', () => {
  assert.equal(formatAlarmDuration(end - first, 'zh'), '24小时9分钟')
  assert.equal(formatAlarmDuration(end - first, 'zh', false, true), '24小时9分钟55秒钟')
  assert.equal(formatAlarmDuration(3600000, 'en'), '1 hour')
  assert.equal(formatAlarmDuration(0, 'en'), '0 seconds')
  assert.equal(formatAlarmDuration(-1, 'en'), '')
  assert.equal(formatAlarmDuration(NaN, 'zh'), '')
})

test('record narratives switch languages and keep the recorded reason and historical semantics', async () => {
  const renderer = vue.createRenderer({
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    insert() {},
    remove() {},
    setText() {},
    setElementText() {},
    patchProp() {},
    parentNode: () => null,
    nextSibling: () => null
  })
  const props = vue.reactive({
    record: { ...record, actualDesc: '系统 CPU 使用率 = 9.86' },
    typeId: 'alarmRecord',
    subject: { typeId: 'device', id: 'device' },
    mode: 'detail'
  })
  let presentation
  const app = renderer.createApp({
    setup() {
      presentation = useAlarmRecordPresentation(props)
      return () => null
    }
  })
  app.mount({})
  try {
    assert.equal(presentation.description.value, props.record.actualDesc)
    assert.match(presentation.conclusion.value, /24小时9分钟/)
    assert.match(presentation.conclusion.value, /人工/)
    assert.deepEqual(
      presentation.timeline.value.map((moment) => moment.kind),
      ['handled', 'latest', 'first']
    )
    assert.equal(presentation.timeline.value[1].label, '最近触发')
    assert.match(presentation.timeline.value[0].duration, /^本轮历时 /)
    assert.match(presentation.timeline.value[1].duration, /^距本轮开始 /)
    assert.deepEqual(
      presentation.timeline.value.map((moment) => moment.color),
      ['blue', 'orange', 'orange']
    )
    props.record.handleType = { value: 'system', text: '系统' }
    assert.equal(presentation.timeline.value[0].color, 'green')
    props.record.handleType = { value: 'other', text: '未知方式' }
    assert.equal(presentation.timeline.value[0].color, 'gray')
    props.record.state = { value: 'warning', text: '告警中' }
    assert.equal(presentation.timeline.value[0].color, 'red')
    props.record.state = record.state
    i18n.global.locale.value = 'en'
    props.record.handleType = { value: 'user', text: 'Manually' }
    await vue.nextTick()
    assert.match(presentation.conclusion.value, /24 hours 9 minutes/)
    assert.equal(presentation.timeline.value[1].label, 'Latest trigger')
    assert.match(presentation.timeline.value[0].duration, /^Cycle lasted /)
    assert.match(presentation.timeline.value[1].duration, / after cycle start$/)
    assert.equal(presentation.timeline.value[0].color, 'blue')
    assert.equal(presentation.description.value.includes('%'), false)
    props.typeId = 'alarmOccurrence'
    props.record = { ...props.record, alarmTime: last, cycleTime: first }
    await vue.nextTick()
    assert.equal(presentation.facts.value.state.text, '')
    assert.equal(presentation.timeline.value[0].color, 'orange')
    assert.match(presentation.conclusion.value, /24 hours 6 minutes/)
    delete props.record.cycleTime
    await vue.nextTick()
    assert.equal(presentation.conclusion.value, '')
    assert.equal(presentation.durationText.value, '')
  } finally {
    app.unmount()
    i18n.global.locale.value = 'zh'
  }
})
