import { randomNumber } from '@jetlinks-web/utils'

export type SceneTriggerKind = 'manual' | 'repeat' | 'date' | 'interval' | 'property' | 'event' | 'online' | 'offline' | 'state' | 'alarm' | 'ai-event'

export const AI_EVENT_RESULT_COLUMNS = ['hitResults', 'maxTargetScore', 'targetCount', 'results', 'numberResults'] as const

export type AiEventResultColumn = typeof AI_EVENT_RESULT_COLUMNS[number]

export interface SceneAiEventMediaTarget {
  deviceId: string
  channelId: string
  /** 编辑器回填信息，不会写入触发器范围配置。 */
  name?: string
  unavailable?: boolean
}

export interface SceneAiEventTriggerConfig {
  sceneId?: string
  sceneName?: string
  taskTarget?: string
  taskTargetName?: string
  mediaTargets?: SceneAiEventMediaTarget[]
  /** 未设置时，范围内的所有 AI 识别结果都可触发。 */
  condition?: {
    column: AiEventResultColumn
    termType?: string
    value?: string | number | boolean
  }
}

export interface SceneAlarmTriggerConfig {
  /** 仅用于编辑器选择来源；提交时由 targetType 表达实际告警目标。 */
  sourceKind?: 'iot-device' | 'visual-ai'
  alarmConfigId?: string
  targetType?: string
  modes: Array<'trigger' | 'relieve'>
  state?: 'warning' | 'normal'
  options?: {
    productId?: string
    deviceId?: string
    alarmConfigName?: string
    sceneId?: string
    sceneName?: string
    taskTarget?: string
    taskTargetName?: string
  }
}

export interface SceneActionForm {
  actionId?: number
  type: 'delay' | 'device' | 'sceneNotify'
  time?: number
  unit?: 'seconds' | 'minutes' | 'hours'
  config?: Record<string, any>
  options?: Record<string, any>
}

export interface SceneTimeRange {
  start: string
  end: string
}

export type SceneConditionForm =
  | { actionId?: number; type: 'timeRange'; ranges: SceneTimeRange[] }
  | {
      actionId?: number
      type: 'deviceProperty'
      productId: string
      selector: 'fixed' | 'space' | 'device-group' | 'all'
      selectorValues: Array<{ value: string; name?: string }>
      options?: { view?: 'space' | 'device-group' | 'custom' | 'all'; productName?: string; propertiesName?: string; name?: string }
      propertyId: string
      termType: string
      value: string | number | boolean
    }
  | {
      actionId?: number
      type: 'alarmState'
      alarm: SceneAlarmTriggerConfig
    }

export interface SceneLinkageForm {
  id?: string
  branchId?: number
  name: string
  description?: string
  summary?: string
  summaryTitle?: string
  debounceEnabled: boolean
  debounceMode: 'continuous' | 'interval'
  debounceTime: number
  triggerKind: SceneTriggerKind
  productId?: string
  productName?: string
  dynamicScope: boolean
  dynamicScopeType: 'device-group' | 'space'
  scopeOptions: { view?: 'space' | 'device-group' | 'custom' | 'all'; names?: string[] }
  allDevices: boolean
  groupIds: string[]
  deviceIds: string[]
  propertyId?: string
  propertyName?: string
  eventId?: string
  eventName?: string
  eventOutputId?: string
  eventOutputName?: string
  eventTermType?: string
  eventTermValue?: string | number | boolean
  deviceState: 'online' | 'offline' | 'any'
  deviceStateTriggerMode: 'immediate' | 'sustained'
  deviceStateSustainedTime: number
  termType: string
  termValue?: string | number | boolean
  repeatTime: string
  repeatMode: 'daily' | 'weekdays' | 'weekends' | 'custom'
  repeatCustomMode: 'weekly' | 'monthly'
  repeatWeekdays: number[]
  repeatMonthDays: number[]
  dateTime?: string
  interval: number
  intervalUnit: 'seconds' | 'minutes' | 'hours'
  alarm: SceneAlarmTriggerConfig
  aiEvent: SceneAiEventTriggerConfig
  additionalConditions: SceneConditionForm[]
  actions: SceneActionForm[]
  multiTriggers?: SceneMultiTriggerForm[]
}

export type SceneMultiTriggerForm = Pick<SceneLinkageForm,
  'triggerKind' | 'productId' | 'productName'
  | 'dynamicScope' | 'dynamicScopeType' | 'scopeOptions' | 'allDevices' | 'groupIds' | 'deviceIds'
  | 'propertyId' | 'propertyName' | 'eventId' | 'eventName' | 'eventOutputId' | 'eventOutputName'
  | 'eventTermType' | 'eventTermValue' | 'deviceState' | 'deviceStateTriggerMode' | 'deviceStateSustainedTime'
  | 'termType' | 'termValue' | 'repeatTime' | 'repeatMode' | 'repeatCustomMode' | 'repeatWeekdays'
  | 'repeatMonthDays' | 'dateTime' | 'interval' | 'intervalUnit' | 'alarm' | 'aiEvent'> & {
  /** 仅用于保持编辑页卡片实例稳定，不会提交到后端。 */
  clientId: number
}

const triggerFormFields: Array<Exclude<keyof SceneMultiTriggerForm, 'clientId'>> = [
  'triggerKind', 'productId', 'productName',
  'dynamicScope', 'dynamicScopeType', 'scopeOptions', 'allDevices', 'groupIds', 'deviceIds',
  'propertyId', 'propertyName', 'eventId', 'eventName', 'eventOutputId', 'eventOutputName',
  'eventTermType', 'eventTermValue', 'deviceState', 'deviceStateTriggerMode', 'deviceStateSustainedTime',
  'termType', 'termValue', 'repeatTime', 'repeatMode', 'repeatCustomMode', 'repeatWeekdays',
  'repeatMonthDays', 'dateTime', 'interval', 'intervalUnit', 'alarm',
  'aiEvent',
]

export interface SceneConditionColumns {
  timeColumn?: string
  timeTermType?: string
  devicePropertyColumns?: string[]
  alarmStateColumns?: string[]
}

export const defaultForm = (): SceneLinkageForm => ({
  name: '',
  summary: '',
  summaryTitle: '',
  triggerKind: 'property',
  debounceEnabled: false,
  debounceMode: 'continuous',
  debounceTime: 60,
  productId: undefined,
  dynamicScope: false,
  dynamicScopeType: 'device-group',
  scopeOptions: {},
  allDevices: false,
  groupIds: [],
  deviceIds: [],
  deviceState: 'offline',
  deviceStateTriggerMode: 'immediate',
  deviceStateSustainedTime: 30,
  termType: 'eq',
  repeatTime: '08:00',
  repeatMode: 'daily',
  repeatCustomMode: 'weekly',
  repeatWeekdays: [],
  repeatMonthDays: [],
  interval: 30,
  intervalUnit: 'minutes',
  alarm: { modes: [] },
  aiEvent: { mediaTargets: [] },
  additionalConditions: [],
  actions: [],
})

const cloneTriggerValue = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value))

export const toMultiTriggerForm = (form: SceneLinkageForm, clientId = randomNumber()): SceneMultiTriggerForm => {
  const result = { clientId } as SceneMultiTriggerForm
  triggerFormFields.forEach(field => {
    result[field] = cloneTriggerValue(form[field])
  })
  return result
}

export const applyMultiTriggerForm = (form: SceneLinkageForm, triggerForm: SceneMultiTriggerForm) => {
  triggerFormFields.forEach(field => {
    form[field] = cloneTriggerValue(triggerForm[field])
  })
}

export const defaultMultiTriggerForm = (): SceneMultiTriggerForm => toMultiTriggerForm(defaultForm())

export const normalizeResult = <T = any>(res: any): { data: T[]; total: number } => {
  const raw = res?.result ?? res
  if (Array.isArray(raw)) return { data: raw, total: raw.length }
  const data = raw?.data || raw?.records || []
  return { data, total: Number(raw?.total ?? raw?.totalElements ?? data.length ?? 0) }
}

export const enumText = (value: any, fallback = '-') => typeof value === 'object'
  ? value?.text || value?.value || fallback
  : value || fallback

const aiEventConditionFromTerms = (terms: Record<string, any>[]) => {
  const condition = terms.find(term => AI_EVENT_RESULT_COLUMNS.includes(term.column as AiEventResultColumn))
  return condition
    ? { column: condition.column as AiEventResultColumn, termType: condition.termType || 'eq', value: condition.value }
    : undefined
}

const toAiEventMediaTargets = (configuration: Record<string, any>, mediaNames: string[] = []): SceneAiEventMediaTarget[] =>
  Array.isArray(configuration?.mediaTargets)
    ? configuration.mediaTargets
      .filter((target: any) => target?.deviceId && target?.channelId)
      .map((target: any, index: number) => ({
        deviceId: target.deviceId,
        channelId: target.channelId,
        name: mediaNames[index],
      }))
    : []

const isAlarmRecordQueryAction = (action: any) => action.executor === 'alarm-record-query'

const parseTimer = (timer: any, form: SceneLinkageForm) => {
  const cron = timer?.cron || ''
  if (cron.includes('/')) {
    const [second, minute, hour] = cron.split(' ')
    form.triggerKind = 'interval'
    // Cron 的前三段依次是秒、分、时，按实际出现的步进字段恢复单位。
    const intervalField = second.includes('/') ? second : minute.includes('/') ? minute : hour
    form.interval = Number(intervalField.split('/')[1] || 30)
    form.intervalUnit = second.includes('/') ? 'seconds' : minute.includes('/') ? 'minutes' : 'hours'
    return
  }
  if (/\d{4}$/.test(cron)) {
    const [, minute = '0', hour = '0', day = '1', month = '1', , year = ''] = cron.split(' ')
    form.triggerKind = 'date'
    if (year) form.dateTime = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
    return
  }
  form.triggerKind = 'repeat'
  const parts = cron.split(' ')
  const dayOfMonth = parts[3] || '?'
  const dayOfWeek = parts[5] || '*'
  if (dayOfMonth !== '?' && dayOfMonth !== '*') {
    form.repeatMode = 'custom'
    form.repeatCustomMode = 'monthly'
    form.repeatMonthDays = dayOfMonth.split(',').map(Number).filter(Number.isInteger)
  } else if (dayOfWeek === '1,2,3,4,5' || dayOfWeek === 'MON-FRI') {
    form.repeatMode = 'weekdays'
  } else if (dayOfWeek === '6,7' || dayOfWeek === 'SAT,SUN') {
    form.repeatMode = 'weekends'
  } else if (dayOfWeek !== '?' && dayOfWeek !== '*') {
    form.repeatMode = 'custom'
    form.repeatCustomMode = 'weekly'
    form.repeatWeekdays = dayOfWeek.split(',').map(Number).filter(Number.isInteger)
  } else {
    form.repeatMode = 'daily'
  }
  form.repeatTime = `${parts[2] || '08'}:${parts[1] || '00'}`
}

const normalizeTime = (value: unknown) => String(value || '').slice(0, 5)
const MANUAL_TIME_RANGE_GATE = '__sceneManualTimeRangeGate'

const isManualTimeRangeGate = (action: any) => action?.executor === 'delay'
  && action.options?.[MANUAL_TIME_RANGE_GATE] === true

const toTimeRange = (value: unknown) => {
  const range = Array.isArray(value) ? value : (value as any)?.value
  if (!Array.isArray(range) || range.length !== 2) return undefined
  const start = normalizeTime(range[0])
  const end = normalizeTime(range[1])
  if (!start || !end) return undefined
  return { start, end }
}

const isEveningRange = (term: any, start: string, end: string) => {
  if (term?.column !== '_now' || term.termType !== 'btw') return false
  const range = Array.isArray(term.value) ? term.value : term.value?.value
  return normalizeTime(range?.[0]) === start && normalizeTime(range?.[1]) === end
}

const findTimeRanges = (terms: any[] = []): SceneTimeRange[] => terms.flatMap((term: any) => {
  const children = term.terms || []
  if (term.type === 'or'
    && children.length === 2
    && isEveningRange(children[0], '20:00', '23:59')
    && isEveningRange(children[1], '00:00', '08:00')) {
    return [{ start: '20:00', end: '08:00' }]
  }
  const current = term.column === '_now' && term.termType === 'btw' ? [toTimeRange(term.value)].filter(Boolean) : []
  return [...current, ...findTimeRanges(children)]
})

const findPropertyTriggerTerm = (terms: any[] = []): any => {
  for (const term of terms) {
    if (String(term?.column || '').startsWith('properties.') && String(term?.column || '').endsWith('.current')) return term
    const child = findPropertyTriggerTerm(term?.terms || [])
    if (child) return child
  }
  return undefined
}

const findEventTriggerTerm = (terms: any[] = []): any => {
  for (const term of terms) {
    if (String(term?.column || '').startsWith('event.data.')) return term
    const child = findEventTriggerTerm(term?.terms || [])
    if (child) return child
  }
  return undefined
}

const findDeviceStateTriggerTerm = (terms: any[] = []): any => {
  for (const term of terms) {
    if (term?.column === 'deviceState') return term
    const child = findDeviceStateTriggerTerm(term?.terms || [])
    if (child) return child
  }
  return undefined
}

export const toForm = (detail: any): SceneLinkageForm => {
  const scene = detail || {}
  const trigger = scene.trigger || {}
  if (trigger.type === 'multi') {
    const items = trigger.multi?.triggers || []
    const toLeafForm = (item: any) => toForm({
      ...scene,
      trigger: item.trigger,
      branches: (scene.branches || []).map((branch: any, index: number) => index
        ? branch
        : { ...branch, when: item.terms || [] }),
    })
    const first = items[0]
    if (first) {
      const form = toLeafForm(first)
      form.multiTriggers = items.map(toLeafForm).map(item => toMultiTriggerForm(item))
      const shakeLimit = scene.branches?.[0]?.shakeLimit || {}
      form.debounceEnabled = Boolean(shakeLimit.enabled)
      form.debounceMode = shakeLimit.continuous ? 'continuous' : 'interval'
      form.debounceTime = Number(shakeLimit.time || 60)
      return form
    }
  }
  const shakeLimit = scene.branches?.[0]?.shakeLimit || trigger.shakeLimit || {}
  const branchShakeLimit = scene.branches?.[0]?.shakeLimit || {}
  const device = trigger.device || {}
  const rawSourceActions = (scene.actions?.length ? scene.actions : (scene.branches || []).flatMap((branch: any) => (branch.then || []).flatMap((group: any) => group.actions || []))) || []
  const manualTimeRangeGates = rawSourceActions.filter(isManualTimeRangeGate)
  const sourceActions = rawSourceActions.filter((action: any) => !isManualTimeRangeGate(action))
  // 新规则将属性触发条件写入首个分支；根 terms 只用于兼容此前保存的场景。
  const propertyTriggerTerm = findPropertyTriggerTerm((scene.branches || []).flatMap((branch: any) => branch.when || []))
    || findPropertyTriggerTerm(scene.terms || [])
  const eventTriggerTerm = findEventTriggerTerm((scene.branches || []).flatMap((branch: any) => branch.when || []))
    || findEventTriggerTerm(scene.terms || [])
  const deviceStateTriggerTerm = findDeviceStateTriggerTerm((scene.branches || []).flatMap((branch: any) => branch.when || []))
  const aiEventTerms = (scene.branches || []).flatMap((branch: any) => branch.when || [])
  const selectorValues = Array.isArray(device.selectorValues) ? device.selectorValues : []
  const deviceConditionActions = sourceActions
    .filter((action: any) => action.executor === 'device-data' && action.configuration?.properties?.length && action.terms?.length)
  const actionConditions = deviceConditionActions
    .map((action: any) => ({
      type: 'deviceProperty' as const,
      productId: action.configuration.productId || '',
      selector: action.configuration.selector?.selector || 'fixed',
      selectorValues: action.configuration.selector?.selectorValues || [],
      options: { ...action.options, ...action.configuration.selector?.options },
      propertyId: action.configuration.properties?.[0] || '',
      termType: action.terms[0].termType || 'eq',
      value: action.terms[0].value,
      actionId: action.actionId,
    }))
  const alarmConditionActions = sourceActions
    .filter((action: any) => isAlarmRecordQueryAction(action)
      && action.terms?.length
      && (action.configuration?.targetType === 'aiTaskMediaTarget' || action.options?.productId))
  const alarmConditions = alarmConditionActions
    .map((action: any) => ({
      type: 'alarmState' as const,
      alarm: {
        alarmConfigId: action.configuration?.alarmConfigId,
        targetType: action.configuration?.targetType || 'device',
        sourceKind: action.configuration?.targetType === 'aiTaskMediaTarget' ? 'visual-ai' : 'iot-device',
        state: action.terms?.[0]?.value === false ? 'normal' : 'warning',
        modes: [],
        options: {
          productId: action.options?.productId,
          deviceId: action.options?.deviceId,
          alarmConfigName: action.options?.name,
          sceneId: action.options?.sceneId,
          sceneName: action.options?.sceneName,
          taskTarget: action.options?.taskTarget,
          taskTargetName: action.options?.taskTargetName,
        },
      },
      actionId: action.actionId,
    }))
  const timeRanges = [...new Map([
    ...findTimeRanges(scene.terms || []),
    ...(scene.branches || []).flatMap((branch: any) => findTimeRanges(branch.when || [])),
    ...manualTimeRangeGates.flatMap((action: any) => findTimeRanges(action.terms || [])),
  ].map(range => [`${range.start}-${range.end}`, range])).values()]
  const conditionActionSet = new Set([...deviceConditionActions, ...alarmConditionActions])
  const conditionActionMap = new Map<any, SceneConditionForm>([
    ...deviceConditionActions.map((action: any, index: number) => [action, actionConditions[index]]),
    ...alarmConditionActions.map((action: any, index: number) => [action, alarmConditions[index]]),
  ])
  const orderedActionConditions = sourceActions.flatMap((action: any) => conditionActionMap.get(action) || [])
  const form = {
    ...defaultForm(),
    id: scene.id,
    branchId: scene.branches?.[0]?.branchId,
    name: scene.name,
    description: scene.description,
    summary: scene.options?.summary || '',
    summaryTitle: scene.options?.summaryTitle || scene.options?.summary || '',
    debounceEnabled: device.operation?.operator === 'state' ? false : Boolean(shakeLimit.enabled),
    debounceMode: shakeLimit.continuous ? 'continuous' : 'interval',
    debounceTime: Number(shakeLimit.time || 60),
    productId: device.productId,
    productName: scene.options?.trigger?.productName || '',
    allDevices: device.selector === 'all',
    dynamicScope: ['space', 'device-group'].includes(device.selector),
    dynamicScopeType: device.selector === 'space' ? 'space' : 'device-group',
    scopeOptions: device.options || {},
    groupIds: ['space', 'device-group'].includes(device.selector) ? selectorValues.map((item: any) => String(item.value)) : [],
    deviceIds: device.selector === 'fixed' ? selectorValues.map((item: any) => String(item.value)) : [],
    propertyId: propertyTriggerTerm?.column?.split('.')?.[1],
    propertyName: scene.options?.trigger?.action,
    eventId: device.operation?.eventId,
    eventName: scene.options?.trigger?.action,
    eventOutputId: eventTriggerTerm?.column?.replace(/^event\.data\./, ''),
    eventTermType: eventTriggerTerm?.termType || 'eq',
    eventTermValue: eventTriggerTerm?.value,
    deviceState: String(deviceStateTriggerTerm?.value) === '1' ? 'online' : deviceStateTriggerTerm ? 'offline' : 'any',
    deviceStateTriggerMode: branchShakeLimit.enabled && branchShakeLimit.continuous ? 'sustained' : 'immediate',
    deviceStateSustainedTime: Number(branchShakeLimit.time || 30),
    termType: propertyTriggerTerm?.termType || 'eq',
    termValue: propertyTriggerTerm?.value,
    alarm: {
      alarmConfigId: trigger.configuration?.alarmConfigId,
      targetType: trigger.configuration?.targetType,
      sourceKind: trigger.configuration?.targetType === 'aiTaskMediaTarget' ? 'visual-ai' : 'iot-device',
      modes: trigger.configuration?.modes || [],
      options: trigger.configuration?.options,
    },
    aiEvent: {
      sceneId: trigger.configuration?.sceneId,
      sceneName: scene.options?.trigger?.aiEvent?.sceneName,
      taskTarget: trigger.configuration?.taskTarget,
      taskTargetName: scene.options?.trigger?.aiEvent?.taskTargetName,
      mediaTargets: toAiEventMediaTargets(
        trigger.configuration || {},
        scene.options?.trigger?.aiEvent?.mediaNames || [],
      ),
      condition: trigger.type === 'ai-event' ? aiEventConditionFromTerms(aiEventTerms) : undefined,
    },
    additionalConditions: [...(timeRanges.length ? [{ type: 'timeRange' as const, ranges: timeRanges }] : []), ...orderedActionConditions],
    actions: sourceActions.filter((action: any) => !conditionActionSet.has(action)).flatMap((action: any) => {
      if (action.executor === 'delay') return [{ actionId: action.actionId, type: 'delay', time: action.delay?.time, unit: action.delay?.unit, options: action.options }]
      if (action.executor === 'device') return [{ actionId: action.actionId, type: 'device', config: action.device, options: action.options }]
      if (action.executor === 'sceneNotify') return [{ actionId: action.actionId, type: 'sceneNotify', config: action.configuration, options: action.options }]
      return []
    }),
  } as SceneLinkageForm
  if (trigger.type === 'manual') form.triggerKind = 'manual'
  else if (trigger.type === 'timer') parseTimer(trigger.timer, form)
  else if (device.operation?.operator === 'reportEvent') form.triggerKind = 'event'
  else if (device.operation?.operator === 'online') form.triggerKind = 'online'
  else if (device.operation?.operator === 'offline') form.triggerKind = 'offline'
  else if (device.operation?.operator === 'state') form.triggerKind = 'state'
  else if (trigger.type === 'alarm') form.triggerKind = 'alarm'
  else if (trigger.type === 'ai-event') form.triggerKind = 'ai-event'
  else form.triggerKind = 'property'
  return form
}

const timerCron = (form: SceneLinkageForm) => {
  if (form.triggerKind === 'interval') {
    return form.intervalUnit === 'seconds'
      ? `0/${form.interval} * * * * ?`
      : form.intervalUnit === 'hours'
      ? `0 0 0/${form.interval} * * ?`
      : `0 0/${form.interval} * * * ?`
  }
  if (form.triggerKind === 'date' && form.dateTime) {
    const date = new Date(form.dateTime)
    return `0 ${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} ? ${date.getFullYear()}`
  }
  const [hour = '08', minute = '00'] = form.repeatTime.split(':')
  const repeatMode = form.repeatMode === 'custom' ? form.repeatCustomMode : form.repeatMode
  if (repeatMode === 'monthly') {
    return `0 ${minute} ${hour} ${form.repeatMonthDays.join(',')} * ?`
  }
  const days = repeatMode === 'weekdays'
    ? '1,2,3,4,5'
    : repeatMode === 'weekends'
      ? '6,7'
      : repeatMode === 'weekly'
        ? form.repeatWeekdays.join(',')
        : '*'
  return `0 ${minute} ${hour} ? * ${days}`
}

export const buildRequest = (form: SceneLinkageForm, conditionColumns: SceneConditionColumns = {}) => {
  const createId = () => randomNumber()
  const ensureActionId = (item: { actionId?: number }) => item.actionId || (item.actionId = createId())
  // 原版编辑器将 branchId/actionId 作为已保存分支和动作的身份标识；首次保存后回写表单，后续编辑不会重建它们。
  const buildTriggerOptions = () => {
    const triggerTypes: Record<SceneTriggerKind, string> = {
      manual: '手动触发', repeat: '重复时间', date: '日期时间', interval: '间隔时间',
      property: '属性上报', event: '事件上报', online: '上线', offline: '离线', state: '设备状态变化', alarm: '告警状态变化', 'ai-event': '视觉事件',
    }
    return {
      name: form.scopeOptions.names?.join('、') || form.productName || '',
      productName: form.productName || '',
      type: form.multiTriggers?.length ? '多条件触发' : triggerTypes[form.triggerKind],
      action: form.triggerKind === 'property' ? form.propertyName || form.propertyId : form.triggerKind === 'event' ? form.eventName || form.eventId : '',
      selector: form.allDevices ? 'all' : form.dynamicScope ? form.dynamicScopeType : 'fixed',
      aiEvent: form.triggerKind === 'ai-event' ? {
        sceneName: form.aiEvent.sceneName,
        taskTargetName: form.aiEvent.taskTargetName,
        mediaNames: form.aiEvent.mediaTargets?.map(target => target.name || `${target.deviceId}/${target.channelId}`),
      } : undefined,
    }
  }
  const buildActionOptions = (action: SceneActionForm) => {
    if (action.type === 'delay') return { name: `延迟 ${action.time || 1} ${action.unit || 'seconds'}` }
    if (action.type === 'device') {
      const config = action.config || {}
      const selectorValues = config.selectorValues || []
      return {
        ...action.options,
        type: action.options?.type || '设备动作',
        name: selectorValues.map((item: any) => item.name || item.value).join('、') || (config.selector === 'all' ? '全部设备' : action.options?.name || ''),
        productName: config.options?.productName || config.productName || action.options?.productName || '',
        propertiesName: config.options?.propertiesName || action.options?.propertiesName || config.message?.functionId || config.message?.properties?.[0] || Object.keys(config.message?.properties || {})[0] || '',
        ...config.options,
      }
    }
    return action.options && Object.keys(action.options).length ? action.options : { type: action.type, name: action.type }
  }
  const isDeviceTrigger = ['property', 'event', 'online', 'offline', 'state'].includes(form.triggerKind)
  const selectorValues = form.dynamicScope
    ? form.groupIds.map(value => ({ value }))
    : form.deviceIds.map((value, index) => ({ value, name: form.scopeOptions.names?.[index] }))
  let trigger: Record<string, any> = form.triggerKind === 'manual'
    ? { type: 'manual', configuration: {} }
    : isDeviceTrigger
      ? {
          type: 'device',
          device: {
            productId: form.productId,
            selector: form.allDevices ? 'all' : form.dynamicScope ? form.dynamicScopeType : 'fixed',
            selectorValues,
            options: form.scopeOptions,
            operation: {
              operator: form.triggerKind === 'event' ? 'reportEvent' : form.triggerKind === 'online' ? 'online' : form.triggerKind === 'offline' ? 'offline' : form.triggerKind === 'state' ? 'state' : 'reportProperty',
              ...(form.triggerKind === 'event' ? { eventId: form.eventId } : {}),
            },
          },
        }
      : form.triggerKind === 'alarm'
        ? {
            type: 'alarm',
            // sourceKind 是编辑器状态；运行时仍只读取通用告警 Trigger 的标准配置。
            configuration: (({ sourceKind: _sourceKind, ...configuration }) => configuration)(form.alarm),
          }
        : form.triggerKind === 'ai-event'
          ? {
              type: 'ai-event',
              configuration: {
                sceneId: form.aiEvent.sceneId,
                taskTarget: form.aiEvent.taskTarget,
                mediaTargets: (form.aiEvent.mediaTargets || []).map(target => ({
                  deviceId: target.deviceId,
                  channelId: target.channelId,
                })),
              },
            }
        : { type: 'timer', timer: { trigger: 'cron', cron: timerCron(form) } }
  // 场景运行时在分支层执行防抖；触发器上的 shakeLimit 仅用于兼容旧规则。
  const debounceShakeLimit = form.debounceEnabled && form.triggerKind !== 'state'
    ? {
        enabled: true,
        time: form.debounceTime,
        threshold: 1,
        continuous: form.debounceMode === 'continuous',
        alarmFirst: form.debounceMode !== 'continuous',
        outputFirst: form.debounceMode !== 'continuous',
        rolling: false,
      }
    : undefined
  const triggerTerms = form.triggerKind === 'property' && form.propertyId && form.termValue !== undefined && form.termValue !== ''
    ? [{ column: `properties.${form.propertyId}.current`, termType: form.termType, value: form.termValue }]
    : []
  const eventTriggerTerms = form.triggerKind === 'event' && form.eventOutputId && form.eventTermValue !== undefined && form.eventTermValue !== ''
    ? [{ column: `event.data.${form.eventOutputId}`, termType: form.eventTermType || 'eq', value: form.eventTermValue }]
    : []
  const stateTriggerTerms = form.triggerKind === 'state' && form.deviceState !== 'any'
    ? [{ column: 'deviceState', termType: 'eq', value: form.deviceState === 'online' ? '1' : '0' }]
    : []
  const aiEventTriggerTerms = form.triggerKind === 'ai-event' && form.aiEvent.condition
    ? [{
        column: form.aiEvent.condition.column,
        termType: form.aiEvent.condition.termType || 'eq',
        value: form.aiEvent.condition.value,
      }]
    : []
  // 视觉 AI 告警与通用告警共享配置契约；算法范围以分支条件收窄，不持久化为 Trigger 配置字段。
  const visualAiAlarmTriggerTerms = form.triggerKind === 'alarm'
    && (form.alarm.sourceKind === 'visual-ai' || form.alarm.targetType === 'aiTaskMediaTarget')
    && form.alarm.options?.sceneId
    && form.alarm.options?.taskTarget
    ? [{
        column: 'bizId',
        termType: 'eq',
        value: `${form.alarm.options.sceneId}-${form.alarm.options.taskTarget}`,
      }]
    : []
  const multiTriggers = form.multiTriggers?.length
    ? form.multiTriggers
    : undefined
  if (multiTriggers) {
    trigger = {
      type: 'multi',
      multi: {
        triggers: multiTriggers.map((item, index) => {
          const leaf = buildRequest({
            ...form,
            ...item,
            debounceEnabled: false,
            branchId: undefined,
            actions: [],
            additionalConditions: [],
            multiTriggers: undefined,
          })
          return {
            index: index + 1,
            trigger: leaf.trigger,
            terms: leaf.branches?.[0]?.when || [],
          }
        }),
      },
    }
  }
  let deviceConditionIndex = 0
  let alarmStateConditionIndex = 0
  let conditionActionIndex = 0
  const conditionActions = form.additionalConditions.flatMap(condition => {
    if (condition.type === 'timeRange') return []
    const actionIndex = ++conditionActionIndex
    if (condition.type === 'deviceProperty') {
      const column = conditionColumns.devicePropertyColumns?.[deviceConditionIndex++]
      return [{
        actionId: ensureActionId(condition),
        executor: 'device-data',
        configuration: {
          productId: condition.productId,
          selector: {
            selector: condition.selector,
            selectorValues: condition.selectorValues,
            options: condition.options,
            source: 'fixed',
            upperKey: '',
          },
          properties: [condition.propertyId],
        },
        terms: column ? [{ column, termType: condition.termType, value: condition.value }] : [],
        options: {
          type: '获取设备信息',
          name: condition.options?.name || condition.selectorValues.map(item => item.name || item.value).join('、') || (condition.selector === 'all' ? '全部设备' : ''),
          productName: condition.options?.productName || '',
          propertiesName: condition.options?.propertiesName || condition.propertyId,
        },
      }]
    }
    const alarm = condition.alarm
    const visualAiAlarm = alarm.sourceKind === 'visual-ai' || alarm.targetType === 'aiTaskMediaTarget'
    return [{
      actionId: ensureActionId(condition),
      executor: 'alarm-record-query',
      configuration: {
        alarmConfigId: alarm.alarmConfigId,
        targetType: visualAiAlarm ? 'aiTaskMediaTarget' : 'device',
        ...(visualAiAlarm ? {} : {
          productId: alarm.options?.productId,
          deviceId: alarm.options?.deviceId,
        }),
      },
      terms: [{ column: conditionColumns.alarmStateColumns?.[alarmStateConditionIndex++] || '', termType: 'eq', value: alarm.state !== 'normal' }],
      options: {
        type: '获取告警记录',
        name: alarm.options?.alarmConfigName || '',
        ...(visualAiAlarm ? {
          sceneId: alarm.options?.sceneId,
          sceneName: alarm.options?.sceneName,
          taskTarget: alarm.options?.taskTarget,
          taskTargetName: alarm.options?.taskTargetName,
        } : {
          productId: alarm.options?.productId,
          deviceId: alarm.options?.deviceId,
        }),
      },
    }]
  })
  const timeRanges = form.additionalConditions
    .filter((condition): condition is Extract<SceneConditionForm, { type: 'timeRange' }> => condition.type === 'timeRange')
    .flatMap(condition => condition.ranges)
  const createTimeTerm = (start: string, end: string) => ({
    column: '_now',
    value: { source: 'manual', value: [`${start}:00`, `${end}:00`] },
    type: 'and',
    termType: 'btw',
    options: [],
    terms: [],
  })
  // 多个时间范围是可选时段，后续范围使用 or 与前一个范围连接。
  const timeTerms = timeRanges.map((range, index) => range.start > range.end
    ? {
        type: 'or',
        termType: 'eq',
        options: [],
        terms: [createTimeTerm('20:00', '23:59:59'), createTimeTerm('00:00', '08:00')],
      }
    : {
        ...createTimeTerm(range.start, range.end),
        type: index ? 'or' : 'and',
      })
  // 手动触发不会为首个动作建立分支条件连线，使用零时长节点将时间条件转移到后续动作连线。
  const manualTimeRangeGate = form.triggerKind === 'manual' && timeTerms.length
    ? [{
        executor: 'delay',
        delay: { time: 0, unit: 'seconds' },
        terms: timeTerms,
        options: { [MANUAL_TIME_RANGE_GATE]: true },
      }]
    : []
  // 串行节点以前一动作的 terms 控制后续节点，条件动作本身不会替代用户配置的执行动作。
  const actions = [...manualTimeRangeGate, ...conditionActions, ...form.actions.map(action => {
    const actionId = ensureActionId(action)
    const options = buildActionOptions(action)
    if (action.type === 'delay') return { actionId, executor: 'delay', delay: { time: action.time || 1, unit: action.unit || 'seconds' }, options }
    if (action.type === 'sceneNotify') {
      const { template: _template, ...configuration } = action.config || {}
      return { actionId, executor: action.type, configuration, options }
    }
    return { actionId, executor: action.type, [action.type]: action.config, options }
  })]
  // 分支模式会禁用触发 SQL 的 where，属性触发条件必须放在首分支中才能拦截动作。
  const branchWhen = multiTriggers ? [] : [
    ...triggerTerms,
    ...eventTriggerTerms,
    ...stateTriggerTerms,
    ...aiEventTriggerTerms,
    ...visualAiAlarmTriggerTerms,
    ...(timeTerms.length && form.triggerKind !== 'manual' ? [{
      type: 'and',
      termType: 'eq',
      options: [],
      terms: timeTerms,
    }] : []),
  ]
  const branchId = form.branchId || (form.branchId = createId())
  const branches = [{
    when: branchWhen,
    then: [{ parallel: false, actions }],
    branchId,
    branchName: '条件 1',
    executeAnyway: true,
    shakeLimit: debounceShakeLimit || (form.triggerKind === 'state' && form.deviceStateTriggerMode === 'sustained' ? {
      enabled: true,
      time: form.deviceStateSustainedTime,
      threshold: 1,
      continuous: true,
      alarmFirst: false,
      outputFirst: false,
      rolling: true,
    } : {
      enabled: false,
      time: 1,
      threshold: 1,
      alarmFirst: true,
    }),
  }]
  // 原版场景编辑器用 options.when 维护分支的展示状态，缺失会在加载时直接调用 undefined.map。
  const branchOptions = branches.map((branch, index) => ({
    terms: branch.when,
    branchName: branch.branchName,
    key: branch.branchId,
    executeAnyway: branch.executeAnyway,
    groupIndex: index + 1,
  }))
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    options: {
      summary: form.summary,
      summaryTitle: form.summaryTitle || form.summary,
      trigger: buildTriggerOptions(),
      when: branchOptions,
    },
    trigger,
    terms: [],
    actions: [],
    branches,
    parallel: false,
  }
}
