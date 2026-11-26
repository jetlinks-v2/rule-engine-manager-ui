import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, sourceRoot, walk, flush, textContent } from './helpers/metricRuntime.mjs'

const locale = { useI18n: () => ({ t: (key, values) => values ? `${key}:${JSON.stringify(values)}` : key, locale: { value: 'zh' } }) }
const load = createMetricLoader({ 'vue-i18n': locale })
const { expressionToFormula, formulaToExpression } = load('components/Metric/template/formula.ts')
const { simulationResultCells, simulationValueText } = load('components/Metric/template/simulationFlow.ts')
const { primaryMetricOutput, summaryMetricOutputs } = load('components/Metric/extensions/presentationSettings.ts')

test('冷链条件、比较边界与逻辑优先级在可视公式往返后保持结果', () => {
  const references = ['temperature', 'lower', 'upper'].map(id => ({ key: id, expression: id, metricId: id, label: id }))
  const conditions = [
    'temperature < lower || temperature > upper',
    'temperature >= lower && temperature <= upper',
    '!(temperature == lower) && (temperature != upper || lower > upper)',
    'temperature > lower && temperature < upper || temperature == upper',
  ]
  for (const source of conditions) {
    const latex = expressionToFormula(source, references, true)
    assert.notEqual(latex, undefined)
    const restored = formulaToExpression(latex, references, true)
    for (const temperature of [-1, 2, 5, 8, 9]) {
      const evaluate = expression => Function('temperature', 'lower', 'upper', `return ${expression}`)(temperature, 2, 8)
      assert.equal(evaluate(restored.expression), evaluate(source), `${source}: ${temperature}`)
    }
    assert.ok(restored.metricIds.includes('temperature'))
    assert.equal(expressionToFormula(source, references), undefined, 'arithmetic mode is not widened implicitly')
  }
  assert.equal(formulaToExpression('\\JLa\\geq 2\\wedge \\JLa\\leq 8', references, true).expression, '((temperature >= 2) && (temperature <= 8))')
  for (const source of ["temperature == 'alarm'", 'unknown > 0', 'temperature >', 'temperature > 8 ? 1 : 0']) {
    assert.equal(expressionToFormula(source, references, true), undefined, 'unsupported expressions stay in advanced mode')
  }
  assert.throws(() => formulaToExpression('\\JLa\\land', references, true))
})

test('同刻最终评估不优选有效值，保留前序原对象和时间顺序', () => {
  const values = [
    { metricId: 'alarm', value: true, evaluationTime: 1000 },
    { metricId: 'alarm', status: 'invalid', reason: 'missing', evaluationTime: 1000 },
    { metricId: 'alarm', value: false, evaluationTime: 2000 },
  ]
  const before = JSON.stringify(values)
  const cells = simulationResultCells(values, new Map([[1000, 2], [2000, 3]]))
  assert.equal(cells[0].primary.value, values[1])
  assert.equal(cells[0].previous[0].value, values[0])
  assert.equal(cells[1].primary.value, values[2])
  assert.deepEqual(cells[1].previous, [])
  assert.equal(JSON.stringify(values), before)
  assert.equal(simulationValueText(false, key => key), 'conditionFalse')
  assert.equal(simulationValueText(true, key => key), 'conditionTrue')
  assert.equal(simulationValueText(0, key => key), '0')
})

test('主要输出使用实例覆盖、模板默认与首项回退，不按行业名称猜测', () => {
  const template = { outputs: [{ metricId: 'coverage' }, { metricId: 'duration' }], options: { presentation: { settings: { primaryOutput: 'duration' } } } }
  assert.equal(primaryMetricOutput(template).metricId, 'duration')
  assert.equal(primaryMetricOutput(template, { presentation: { primaryOutput: 'coverage' } }).metricId, 'coverage')
  assert.equal(primaryMetricOutput(template, { presentation: { primaryOutput: 'removed' } }).metricId, 'coverage')
  assert.equal(primaryMetricOutput({ outputs: [] }), undefined)
})

test('卡片摘要最多两项，模板默认可被实例覆盖，状态卡不重复展开全部输出', () => {
  const template = { outputs:['state','a','b','c'].map(metricId => ({ metricId })), definitions:[] }
  const ids = config => summaryMetricOutputs(template, config).map(output => output.metricId)
  assert.deepEqual(ids(), ['a','b'])
  template.options = { presentation:{ settings:{ summaryOutputs:['c','a','b','c','missing','state'] } } }
  assert.deepEqual(ids(), ['c','a'])
  assert.deepEqual(ids({ presentation:{ summaryOutputs:[] } }), [])
  assert.deepEqual(ids({ presentation:{ summaryOutputs:['missing','b','b','state'] } }), ['b'])
  delete template.options
  template.definitions = [{ id:'state', stateTracking:{} }]
  assert.deepEqual(ids(), [])
  assert.deepEqual(summaryMetricOutputs({ outputs:[] }), [])
})

test('路由与页面离开共用脏状态，取消保留、确认放行、保存阻断且卸载移除监听', async () => {
  let routeGuard, pendingResolve, confirmations = 0
  const listeners = new Map()
  const previousWindow = globalThis.window
  globalThis.window = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) }
  const { useTemplateLeaveGuard } = createMetricLoader({ 'vue-router': { onBeforeRouteLeave: guard => { routeGuard = guard } } })('components/Metric/template/useTemplateLeaveGuard.ts')
  const dirty = ref(false), saving = ref(false)
  let canLeave
  const view = createMetricRenderer()
  const app = view.renderer.createApp(defineComponent({ setup() {
    canLeave = useTemplateLeaveGuard(dirty, saving, () => { confirmations++; return new Promise(resolve => { pendingResolve = resolve }) })
    return () => h('guard-owner')
  } }))
  try {
    app.mount(view.root)
    assert.equal(await routeGuard(), true)
    dirty.value = true
    const first = routeGuard(), duplicate = canLeave()
    assert.equal(first, duplicate); assert.equal(confirmations, 1)
    pendingResolve(false); assert.equal(await first, false); assert.equal(dirty.value, true)
    const second = routeGuard(); pendingResolve(true); assert.equal(await second, true)
    let prevented = false
    const event = { preventDefault: () => { prevented = true }, returnValue: undefined }
    listeners.get('beforeunload')(event)
    assert.equal(prevented, true); assert.equal(event.returnValue, '')
    dirty.value = false; saving.value = true
    assert.equal(await routeGuard(), false)
    saving.value = false; assert.equal(await routeGuard(), true)
  } finally { app.unmount(); globalThis.window = previousWindow }
  assert.equal(listeners.size, 0)
})

test('成立、恢复、适用条件共享引用且独立维护不完整草稿状态', async () => {
  const changes = [], invalid = []
  const Formula = defineComponent({ props: { modelValue: String, conditions: Boolean }, setup: (props, { attrs }) => () => h('condition-editor', { ...attrs, value: props.modelValue, conditions: props.conditions }) })
  const RuleEditor = createMetricLoader({ 'vue-i18n': locale,
    [resolve(sourceRoot, 'components/Metric/template/TemplateFormulaEditor.vue')]: { default: Formula, __esModule: true },
  })('components/Metric/template/TemplateRuleEditor.vue').default
  const rule = { id: 'alarm', dependsOn: ['temperature'], temporalCondition: { enterExpression: 'temperature > 8', exitExpression: 'temperature <= 8', dwell: 'PT5M', recovery: 'PT2M' } }
  const template = { inputDefinitions: [{ id: 'temperature', name: '温度' }, { id: 'ambient', name: '环境' }], definitions: [rule], outputs: [], parameterDefinitions: [] }
  const view = createMetricRenderer()
  const app = view.renderer.createApp(RuleEditor, { template, rule, onPatch: patch => changes.push(patch), onInvalid: value => invalid.push(value) })
  app.config.warnHandler = () => {}
  try {
    app.mount(view.root); await flush()
    assert.equal(walk(view.root, node => node.type === 'condition-editor').length, 2, '未配置适用条件时不展开空编辑器')
    await walk(view.root, node => node.type === 'a-button' && textContent(node).includes('addCondition'))[0].props.onClick(); await flush()
    const editors = walk(view.root, node => node.type === 'condition-editor')
    assert.equal(editors.length, 3)
    assert.ok(editors.every(editor => editor.props.conditions === true))
    editors[0].props.onInvalid(true); editors[1].props.onInvalid(false)
    assert.equal(invalid.at(-1), true)
    editors[0].props.onInvalid(false); assert.equal(invalid.at(-1), false)
    editors[0].props.onChange({ expression: '(ambient > 10)', metricIds: ['ambient'] })
    assert.deepEqual(changes.at(-1).dependsOn, ['temperature', 'ambient'])
    assert.equal(changes.at(-1).temporalCondition.exitExpression, 'temperature <= 8')
  } finally { app.unmount() }
})
