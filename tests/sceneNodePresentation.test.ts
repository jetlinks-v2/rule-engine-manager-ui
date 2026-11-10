import { toThingModelOptions } from '../views/SceneLinkage/editor/thingModel'
import assert from 'node:assert/strict'
import test from 'node:test'
import zh from '../locales/lang/zh.json'
import en from '../locales/lang/en.json'
import { actionNodeSummaryParts, collectorNodeSummaryParts } from '../views/SceneLinkage/editor/actionNodeSummary'
import { quickTriggerSummaryParts } from '../views/SceneLinkage/editor/quickTriggerSummary'
import { conditionNodeSummaryParts } from '../views/SceneLinkage/editor/conditionNodeSummary'
import { localizedSummaryParts, summaryPartsText, summaryText, type SummaryTranslate } from '../views/SceneLinkage/editor/summaryParts'
import { detailedTriggerSummaryParts } from '../views/SceneLinkage/editor/detailedTriggerSummary'
import { timerNodeSummaryParts } from '../views/SceneLinkage/editor/timerNodeSummary'
import testLocale from './sceneTestLocale'
import { defaultForm, buildRequest } from '../views/SceneLinkage/utils'

const translate = (messages: Record<string, string>): SummaryTranslate => (key, params = {}) => (messages[key] || key).replace(/\{([^}]+)\}/g, (_, name) => String(params[name] ?? ''))
const t = translate(zh)
const fields = (parts: ReturnType<typeof actionNodeSummaryParts>) => parts.filter(part => part.field).map(part => part.text)

test('collector read and write include the channel, collector and point with highlighted resources', () => {
  const options = { productName: 'modbus风扇', name: '1号排风扇', triggerName: '旧采集器', pointName: '开关' }
  const read = actionNodeSummaryParts({ executor: 'collector', collector: { handlerType: 'read' }, options }, t)
  assert.equal(summaryPartsText(read), '读取modbus风扇中1号排风扇的开关')
  assert.deepEqual(fields(read), ['modbus风扇', '1号排风扇', '开关'])
  for (const value of [0, false]) {
    const write = actionNodeSummaryParts({ executor: 'collector', collector: { handlerType: 'write', value, source: 'fixed' }, options }, t)
    assert.ok(summaryPartsText(write).endsWith(`写入为${value}`))
    assert.equal(fields(write).at(-1), String(value))
  }
  assert.equal(summaryPartsText(collectorNodeSummaryParts({ operator: 'sub' }, options, t)), '订阅modbus风扇中1号排风扇的开关')
})

test('device information supports nested selectors without icons or artificial newlines', () => {
  for (const selector of [{ selector: 'fixed', selectorValues: [{ value: 'd1', name: 'TCP' }] }, { selector: 'space', selectorValues: [{ value: 's1', name: '3F' }] }]) {
    const parts = actionNodeSummaryParts({ executor: 'device-data', configuration: { selector }, options: { productName: 'TCP产品' } }, t)
    const text = summaryPartsText(parts)
    assert.ok(text.startsWith('获取'))
    assert.ok(text.endsWith('的设备信息'))
    assert.ok(!text.includes('\n'))
    assert.ok(text.includes(selector.selector === 'fixed' ? 'TCP' : '3F'))
    assert.equal(fields(parts).length, selector.selector === 'fixed' ? 1 : 2)
  }
  assert.doesNotThrow(() => actionNodeSummaryParts({ executor: 'device-data', configuration: {} }, t))
})

test('device writes preserve zero, false, multiple properties and variable references without mutation', () => {
  const action = { executor: 'device', device: { selector: 'fixed', message: { messageType: 'WRITE_PROPERTY', properties: { power: { value: false, source: 'fixed' }, speed: { value: 0, source: 'fixed' } } } }, options: { name: ['TCP'], propertiesName: '开关、转速' }, custom: { keep: true } }
  const before = structuredClone(action)
  const parts = actionNodeSummaryParts(action, t)
  assert.ok(summaryPartsText(parts).includes('power=false、speed=0'))
  assert.deepEqual(action, before)
  const variable = actionNodeSummaryParts({ ...action, device: { ...action.device, message: { messageType: 'WRITE_PROPERTY', properties: { speed: { source: 'upper', value: { column: 'internal' } } } } } }, t)
  assert.ok(summaryPartsText(variable).includes('引用参数'))
  assert.ok(!summaryPartsText(variable).includes('[object Object]'))
})

test('read, function, delay, alarm query and legacy providers keep readable action semantics', () => {
  const read = actionNodeSummaryParts({ executor: 'device', device: { message: { messageType: 'READ_PROPERTY', properties: ['p'] } }, options: { name: 'TCP', propertiesName: '转速' } }, t)
  assert.equal(summaryPartsText(read), '读取 TCP 的 转速')
  const invoke = actionNodeSummaryParts({ executor: 'device', device: { message: { messageType: 'INVOKE_FUNCTION', functionId: 'start', inputs: [{ name: 'enabled', value: false }] } }, options: { name: 'TCP', propertiesName: '启动' } }, t)
  assert.ok(summaryPartsText(invoke).includes('enabled=false'))
  assert.ok(fields(actionNodeSummaryParts({ executor: 'delay', delay: { time: 0, unit: 'seconds' } }, t)).includes('0'))
  assert.ok(fields(actionNodeSummaryParts({ executor: 'alarm-record-query', options: { name: '超温' } }, t)).includes('超温'))
  assert.ok(summaryPartsText(actionNodeSummaryParts({ executor: 'alarm', alarm: { mode: 'relieve' } }, t)))
  assert.ok(summaryPartsText(actionNodeSummaryParts({ executor: 'notify', notify: { notifyType: 'email' }, options: { sendTo: 'admin', templateName: '告警模板' } }, t)).includes('告警模板'))
  assert.ok(summaryPartsText(actionNodeSummaryParts({ executor: 'custom', options: { type: '外部动作', name: '测试' } }, t)).includes('外部动作'))
})

test('notifications retain every selected recipient and use resolved names rather than raw IDs', () => {
  const action = { executor: 'sceneNotify', configuration: { userIds: ['u1', 'u2', 'u3', 'u4'], notifyChannelIds: ['m'] } }
  const users = ['甲', '乙', '丙', '丁'].map((name, i) => ({ id: `u${i + 1}`, name }))
  const parts = actionNodeSummaryParts(action, t, { users, methods: [{ id: 'm', name: '站内通知', providerId: 'scene', channelProvider: 'inbox' }] })
  assert.deepEqual(fields(parts), ['站内通知', '甲', '乙', '丙', '丁'])
  assert.ok(!summaryPartsText(parts).includes('u1'))
})

test('all quick device triggers retain meaningful fields and false/zero comparisons', () => {
  for (const kind of ['property', 'event', 'online', 'offline', 'state'] as const) {
    const form = { ...defaultForm(), triggerKind: kind, deviceIds: ['d1'], scopeOptions: { names: ['TCP'] }, propertyName: '开关', termType: 'eq', termValue: false, eventName: '告警', eventOutputName: '级别', eventTermType: 'eq', eventTermValue: 0 }
    const before = structuredClone(form)
    const parts = quickTriggerSummaryParts(form, t)
    assert.ok(fields(parts).includes('TCP'))
    if (kind === 'property') assert.ok(fields(parts).includes('false'))
    if (kind === 'event') assert.ok(fields(parts).includes('0'))
    assert.deepEqual(form, before)
  }
})

test('timer custom schedules, manual, visual events and both alarm transitions remain visible', () => {
  const base = defaultForm()
  const custom = quickTriggerSummaryParts({ ...base, triggerKind: 'repeat', repeatMode: 'custom', repeatCustomMode: 'weekly', repeatWeekdays: [1, 5] }, t)
  assert.ok(summaryPartsText(custom).includes(t('IotSceneLinkage.weekday.friday')))
  for (const kind of ['date', 'interval', 'manual', 'ai-event'] as const) {
    const form = { ...base, triggerKind: kind, dateTime: '2026-11-09 09:00:00', aiEvent: { ...base.aiEvent, sceneName: '园区', taskTargetName: '人员', mediaTargets: [{ deviceId: 'd', channelId: 'c', name: '北门' }], recognitionRule: { type: 'hits' as const, time: 60, threshold: 2 } } }
    assert.ok(summaryPartsText(quickTriggerSummaryParts(form, t)))
    if (kind === 'ai-event') assert.ok(fields(quickTriggerSummaryParts(form, t)).includes('北门'))
  }
  const alarm = quickTriggerSummaryParts({ ...base, triggerKind: 'alarm', alarm: { ...base.alarm, modes: ['trigger', 'relieve'], options: { alarmConfigName: '超温', deviceName: 'TCP' } } }, t)
  assert.ok(summaryPartsText(alarm).includes(t('IotSceneLinkage.alarmMode.trigger')))
  assert.ok(summaryPartsText(alarm).includes(t('IotSceneLinkage.alarmMode.relieve')))
})

test('condition fields and localized templates preserve values and language-specific order', () => {
  const parts = conditionNodeSummaryParts({ type: 'deviceProperty', productId: 'p', selector: 'fixed', selectorValues: [{ value: 'd', name: 'TCP' }], propertyId: 'on', termType: 'eq', value: false }, t)
  assert.ok(fields(parts).includes('false'))
  const english = localizedSummaryParts(translate(en), 'IotSceneLinkage.node.collectorRead', { channel: 'Channel', collector: 'Collector', point: 'Point' })
  assert.equal(summaryPartsText(english), 'Read Point from Collector in Channel')
  assert.deepEqual(fields(english), ['Point', 'Collector', 'Channel'])
  assert.equal(summaryText(false), 'false')
  assert.equal(summaryText(0), '0')
})


test('detailed device triggers retain branch-based state duration and property comparisons', () => {
  const base = { ...defaultForm(), deviceIds: ['d'], scopeOptions: { names: ['TCP'] } }
  for (const form of [
    { ...base, triggerKind: 'property' as const, propertyId: 'power', propertyName: '开关', termValue: false },
    { ...base, triggerKind: 'state' as const, deviceState: 'offline' as const, deviceStateTriggerMode: 'sustained' as const, deviceStateSustainedTime: 30 },
  ]) {
    const rule = buildRequest(form)
    const before = structuredClone(rule)
    const native = detailedTriggerSummaryParts(rule.trigger, rule.options.trigger, t, rule.trigger.type, rule)
    assert.equal(summaryPartsText(native), summaryPartsText(quickTriggerSummaryParts(form, t)))
    assert.deepEqual(rule, before)
  }
})

test('native Cron rules show localized readable time and retain invalid expressions without inventing defaults', () => {
  const timer = { trigger: 'cron' as const, cron: '0 0 8 ? * 1,5', mod: 'once' }
  const text = summaryPartsText(timerNodeSummaryParts(timer))
  assert.equal(summaryPartsText(timerNodeSummaryParts({ cron: timer.cron } as typeof timer)), text)
  assert.ok(text.includes('08:00'))
  assert.ok(text.includes('星期一'))
  assert.ok(text.includes('星期五'))
  testLocale.global.locale.value = 'en'
  assert.ok(summaryPartsText(timerNodeSummaryParts(timer)).includes('Monday'))
  testLocale.global.locale.value = 'zh'
  assert.equal(summaryPartsText(timerNodeSummaryParts({ ...timer, cron: 'unsupported' })), 'unsupported')
})

test('native collector periodic read/write and multi-trigger leaves retain schedule and independent terms', () => {
  const options = { channelName: '通道', collectorName: '采集器', pointName: '转速' }
  const collector = { type: 'collector', collector: { operator: 'write', collectorConfig: { value: 0 }, timer: { trigger: 'cron', cron: '0 0 8 * * ?', mod: 'once' } } }
  const parts = detailedTriggerSummaryParts(collector, options, t)
  assert.ok(summaryPartsText(parts).includes('08:00'))
  assert.ok(summaryPartsText(parts).includes('写入为0'))
  const first = buildRequest({ ...defaultForm(), triggerKind: 'property', deviceIds: ['d'], scopeOptions: { names: ['TCP'] }, propertyId: 'p', termValue: false })
  const terms = first.branches[0].when
  const multi = detailedTriggerSummaryParts({ type: 'multi', multi: { triggers: [{ trigger: first.trigger, options: first.options.trigger, terms }, { trigger: { type: 'manual' } }] } }, {}, t)
  assert.ok(summaryPartsText(multi).includes('false'))
  assert.ok(summaryPartsText(multi).includes(t('IotSceneLinkage.rule.or')))
})


test('unary property/event conditions show only their operator in quick and native summaries', () => {
  for (const termType of ['isnull', 'notnull']) {
    const base = defaultForm()
    for (const kind of ['property', 'event'] as const) {
      const parts = quickTriggerSummaryParts({ ...base, triggerKind: kind, propertyName: '温度', termType, termValue: undefined, eventName: '事件', eventOutputName: '输出', eventTermType: termType, eventTermValue: 123 }, t)
      const text = summaryPartsText(parts)
      assert.ok(text.includes(t(`IotSceneLinkage.term.${termType}`)))
      assert.ok(!text.includes('123'))
    }
    const parts = conditionNodeSummaryParts({ type: 'deviceProperty', productId: 'p', selector: 'fixed', selectorValues: [], propertyId: 'p', termType, value: 123 }, t)
    assert.ok(!summaryPartsText(parts).includes('123'))
  }
})


test('native timer summaries respect monthly dates, execution mode and custom calendar without stale fields', () => {
  const period = { from: '01:00:00', to: '23:59:59', every: 55, unit: 'seconds' as const }
  const monthly = { trigger: 'month' as const, when: ['10'], mod: 'period', period, once: { time: '08:00:00' } }
  const before = structuredClone(monthly)
  const text = summaryPartsText(timerNodeSummaryParts(monthly))
  for (const value of ['10', '55', '01:00:00', '23:59:59']) assert.ok(text.includes(value), text)
  assert.ok(!text.includes('08:00:00'))
  const once = summaryPartsText(timerNodeSummaryParts({ ...monthly, mod: 'once' }))
  assert.ok(once.includes('08:00:00'))
  assert.ok(!once.includes('55'))
  assert.equal(summaryPartsText(timerNodeSummaryParts({ trigger: 'multi', mod: 'period', multi: { type: 'and', spec: [] } })), '指定时间')
  assert.deepEqual(monthly, before)
})

test('alarm overview highlights target, rule and chosen states without a connecting colon in both modes', () => {
  const form = { ...defaultForm(), triggerKind: 'alarm' as const }
  form.alarm = { ...form.alarm, modes: ['relieve'], options: { deviceName: '风扇', alarmConfigName: '过热' } }
  const quick = quickTriggerSummaryParts(form, t)
  assert.deepEqual(fields(quick), ['风扇', '过热', t('IotSceneLinkage.alarmMode.relieve')])
  assert.ok(!summaryPartsText(quick).includes('：'))
  const rule = buildRequest(form)
  assert.equal(summaryPartsText(detailedTriggerSummaryParts(rule.trigger, rule.options.trigger, t)), summaryPartsText(quick))
})


test('device scopes show actual space/group/organization names with plain connectors in quick and detailed summaries', () => {
  const productName = '蓝光照射仪'
  for (const selector of ['space', 'device-group', 'org']) {
    const trigger = { type: 'device', device: { productId: 'p', selector, selectorValues: [{ value: 's1', name: '2F' }], operation: { operator: 'online' } } }
    const options = { productName, name: '所有的蓝光照射仪' }
    const before = structuredClone(trigger)
    const parts = detailedTriggerSummaryParts(trigger, options, t)
    assert.equal(summaryPartsText(parts), '2F 所有的 蓝光照射仪在线')
    assert.deepEqual(fields(parts), ['2F', productName])
    assert.ok(parts.some(part => !part.field && part.text.includes('所有的')))
    assert.deepEqual(trigger, before)
    const action = actionNodeSummaryParts({ executor: 'device-data', configuration: { selector: trigger.device }, options }, t)
    assert.deepEqual(fields(action), ['2F', productName])
    if (selector !== 'org') {
      const quick = quickTriggerSummaryParts({ ...defaultForm(), triggerKind: 'online', productName, dynamicScope: true, dynamicScopeType: selector, groupIds: ['s1'], scopeOptions: { names: ['2F'] } } as any, t)
      assert.equal(summaryPartsText(quick), summaryPartsText(parts))
    }
  }
})

test('device summaries truncate by count and length but retain full names for hover and preserve the saved selection', () => {
  for (const names of [['甲', '乙', '丙', '丁'], ['超长设备名称'.repeat(10)], ['一号设备', '二号设备', '三号设备']]) {
    const rule = { type: 'device', device: { selector: 'fixed', selectorValues: names.map((name, index) => ({ value: String(index), name })), operation: { operator: 'online' } } }
    const snapshot = structuredClone(rule)
    const parts = detailedTriggerSummaryParts(rule, {}, t)
    const target = parts.find(part => part.field)!
    const truncated = names.length > 3 || Array.from(names.join('、')).length > 30
    assert.equal(target.text.endsWith('…'), truncated)
    assert.equal(target.title, names.join('、'))
    assert.ok(Array.from(target.text).length <= 31)
    assert.ok(summaryPartsText(parts).endsWith('在线'))
    assert.deepEqual(rule, snapshot)
    const quick = quickTriggerSummaryParts({ ...defaultForm(), triggerKind: 'online', deviceIds: names.map((_, index) => String(index)), scopeOptions: { names } }, t)
    assert.equal(summaryPartsText(quick), summaryPartsText(parts))
  }
})


test('legacy fixed device IDs retain cached names when selector values have no name', () => {
  const parts = actionNodeSummaryParts({ executor: 'device-data', configuration: { selector: { selector: 'fixed', selectorValues: [{ value: 'raw-id' }] } }, options: { name: ['TCP设备'] } }, t)
  assert.deepEqual(fields(parts), ['TCP设备'])
  assert.ok(!summaryPartsText(parts).includes('raw-id'))
})


test('weekly and monthly summaries list one or two choices directly and only mark real omissions', () => {
  for (const trigger of ['week', 'month'] as const) {
    for (const when of [['1'], ['1', '3'], ['1', '3', '5'], ['1', '2', '3']]) {
      const timer = { trigger, when, mod: 'once', once: { time: '08:00:00' } }
      const original = structuredClone(timer)
      const text = summaryPartsText(timerNodeSummaryParts(timer))
      assert.equal(text.includes('...'), when.join(',') === '1,3,5', text)
      assert.ok(text.includes('08:00:00'), text)
      if (when.length <= 2) {
        assert.ok(!text.includes('等'), text)
        if (trigger === 'week') for (const day of when) assert.ok(text.includes(day === '1' ? '星期一' : '星期三'), text)
        else for (const day of when) assert.ok(text.includes(day + '号'), text)
      }
      assert.deepEqual(timer, original)
    }
  }
})

test('calendar summaries resolve selected tags and keep each rule execution time, period and relation', () => {
  const tags = [{ id: 'work', name: '工作日' }, { id: 'holiday', name: '节假日' }]
  const timer = { trigger: 'multi' as const, mod: '', multi: { type: 'or', spec: [
    { trigger: 'calender', scheduleTags: ['work'], mod: 'period', period: { from: '00:00:00', to: '23:59:59', every: 1, unit: 'seconds' } },
    { trigger: 'calender', scheduleTags: ['holiday'], mod: 'once', once: { time: '08:00:00' } },
  ] } }
  const original = structuredClone(timer)
  const parts = timerNodeSummaryParts(timer, tags)
  const text = summaryPartsText(parts)
  for (const value of ['工作日', '节假日', '00:00:00-23:59:59', '每1秒执行1次', '08:00:00', '或']) assert.ok(text.includes(value), text)
  assert.ok(!text.includes('每天'))
  assert.ok(!text.includes('指定时间'))
  assert.ok(summaryPartsText(timerNodeSummaryParts({ ...timer, multi: { ...timer.multi, type: 'and' } }, tags)).includes(' 且 '))
  const single = summaryPartsText(timerNodeSummaryParts({ ...timer, multi: { type: 'or', spec: [timer.multi.spec[0]] } }, tags))
  assert.equal(single, '工作日 00:00:00-23:59:59 每1秒执行1次')
  const trigger = { type: 'timer', timer }
  assert.equal(summaryPartsText(detailedTriggerSummaryParts(trigger, {}, t, '', {}, {}, tags)), text)
  const multi = { type: 'multi', multi: { triggers: [{ trigger }] } }
  assert.ok(summaryPartsText(detailedTriggerSummaryParts(multi, {}, t, '', {}, {}, tags)).includes('工作日'))
  const missing = summaryPartsText(timerNodeSummaryParts(timer))
  assert.ok(missing.includes('日历条件'))
  assert.ok(!missing.includes('holiday'))
  assert.deepEqual(timer, original)
})

test('device actions enrich metadata without removing supported complex properties and functions', () => {
  const properties = [{ id: 'speed', name: '转速', valueType: { type: 'int', unit: '转每分钟' } }, { id: 'config', name: '配置', valueType: { type: 'object' } }]
  assert.deepEqual(toThingModelOptions(properties).map(item => item.value), ['speed'])
  const options = toThingModelOptions(properties, 'property', true)
  assert.deepEqual(options.map(item => item.value), ['speed', 'config'])
  assert.equal(options[0].label, '转速')
  assert.equal(options[0].unit, '转每分钟')
  const functions = toThingModelOptions([{ id: 'start', name: '启动', valueType: { type: 'object' }, inputs: [{ id: 'config' }], outputs: [{ id: 'state' }] }], 'function', true)
  assert.equal(functions[0].inputCount, 1)
  assert.equal(functions[0].outputCount, 1)
})
