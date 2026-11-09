<template>
  <a-modal
    :open="open"
    :width="980"
    :footer="null"
    :mask-closable="false"
    wrap-class-name="scene-alarm-condition-modal"
    @cancel="$emit('cancel')"
  >
    <template #title>{{ title }}</template>
    <div class="alarm-condition-modal">
      <aside class="alarm-condition-modal__rules">
        <div class="alarm-condition-modal__rules-title">
          <strong>{{ listTitle }}</strong>
          <span>{{ $t('IotSceneLinkage.alarmCondition.ruleCount', { count: filteredRules.length }) }}</span>
        </div>
        <a-input v-model:value="keyword" allow-clear :placeholder="searchPlaceholder">
          <template #prefix><AIcon type="SearchOutlined" /></template>
        </a-input>
        <a-spin :spinning="loading">
          <div class="alarm-condition-modal__rule-list">
            <button
              v-for="rule in filteredRules"
              :key="rule.id"
              :class="['alarm-condition-modal__rule', { 'alarm-condition-modal__rule--selected': rule.id === selectedRuleId }]"
              @click="selectRule(rule)"
            >
              <span class="alarm-condition-modal__rule-head"><span class="alarm-condition-modal__rule-name">{{ rule.name }}</span><a-tag v-if="rule.level" :color="alarmLevelColor(rule.level)">{{ alarmLevelText(rule.level) }}</a-tag></span>
              <span v-for="line in rule.lines" :key="line" class="alarm-condition-modal__rule-line">{{ line }}</span>
            </button>
            <a-result v-if="!loading && loadError" status="error" :title="$t('IotSceneLinkage.alarmCondition.loadFailed')">
              <template #extra><a-button type="link" @click="resetAndLoad">{{ $t('IotSceneLinkage.action.retry') }}</a-button></template>
            </a-result>
            <a-empty v-else-if="!loading && !filteredRules.length" :description="$t('IotSceneLinkage.alarmCondition.empty')" />
          </div>
        </a-spin>
      </aside>

      <section class="alarm-condition-modal__detail">
        <template v-if="selectedRule">
          <header class="alarm-condition-modal__detail-header">
            <span class="alarm-condition-modal__detail-icon"><AIcon :type="sourceKind === 'visual-ai' ? 'EyeOutlined' : 'AlertOutlined'" /></span>
            <div><strong>{{ selectedRule.name }}</strong><small>{{ sourceLabel }}</small></div>
            <a-tag v-if="selectedRule.level" :color="alarmLevelColor(selectedRule.level)">{{ alarmLevelText(selectedRule.level) }}</a-tag>
            <a-tooltip :title="$t('IotSceneLinkage.alarmCondition.detailHelp')"><AIcon type="QuestionCircleOutlined" /></a-tooltip>
          </header>

          <dl class="alarm-condition-modal__detail-list">
            <template v-for="item in selectedRule.details" :key="item.label">
              <dt>{{ item.label }}</dt><dd>{{ item.value }}</dd>
            </template>
          </dl>

          <section v-if="states.length" class="alarm-condition-modal__state">
            <strong>{{ stateTitle }}</strong>
            <div class="alarm-condition-modal__state-options">
              <button
                v-for="state in states"
                :key="state.value"
                :class="['alarm-condition-modal__state-option', { 'alarm-condition-modal__state-option--selected': isStateSelected(state.value) }]"
                @click="changeState(state.value)"
              >
                <AIcon :type="state.icon" /><b>{{ state.label }}</b><a-tooltip :title="state.description"><AIcon type="QuestionCircleOutlined" /></a-tooltip>
              </button>
            </div>
          </section>
        </template>
        <a-empty v-else :description="$t('IotSceneLinkage.alarmCondition.selectRule')" />
      </section>

      <div class="alarm-condition-modal__preview">
        <b>{{ previewLabel }}</b>
        <span>{{ previewText }}</span>
      </div>
    </div>
    <footer class="alarm-condition-modal__footer">
      <a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
      <a-button type="primary" :disabled="!selectedRule" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button>
    </footer>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getProduct,
  queryAiAggregateTasks,
  queryAiAlarmSceneTree,
  queryDeviceAlarmPreprocesses,
  queryDevicesPage,
  type AiAggregateTaskOption,
  type AiSceneTreeOption,
} from '../../../../api/scene-linkage'
import { normalizeResult, type SceneAlarmTriggerConfig } from '../../utils'
import { formatTriggerText } from '../alarm/utils'

type SourceKind = 'iot-device' | 'visual-ai'
type AlarmRule = {
  id: string
  name: string
  level?: number
  lines: string[]
  details: Array<{ label: string; value: string }>
  value: SceneAlarmTriggerConfig
}

const props = defineProps({
  open: Boolean,
  sourceKind: { type: String as PropType<SourceKind>, required: true },
  mode: { type: String as PropType<'trigger' | 'condition' | 'query'>, default: 'condition' },
  modelValue: { type: Object as PropType<SceneAlarmTriggerConfig>, required: true },
})
const emit = defineEmits<{
  (event: 'update:modelValue', value: SceneAlarmTriggerConfig): void
  (event: 'cancel'): void
  (event: 'save'): void
}>()

const { t } = useI18n()
const loading = ref(false)
const loadError = ref(false)
const keyword = ref('')
const rules = ref<AlarmRule[]>([])
const selectedRuleId = ref<string>()
const draft = ref<SceneAlarmTriggerConfig>(clone(props.modelValue))

const title = computed(() => props.mode === 'query'
  ? t('IotSceneLinkage.alarmCondition.queryTitle')
  : t(props.sourceKind === 'visual-ai'
    ? 'IotSceneLinkage.condition.visualAlarmState'
    : 'IotSceneLinkage.condition.iotAlarmState'))
const listTitle = computed(() => t(props.sourceKind === 'visual-ai'
  ? 'IotSceneLinkage.alarmCondition.visualRuleList'
  : 'IotSceneLinkage.alarmCondition.iotRuleList'))
const sourceLabel = computed(() => t(props.sourceKind === 'visual-ai'
  ? 'IotSceneLinkage.alarmSource.visualAi'
  : 'IotSceneLinkage.alarmSource.iotDevice'))
const searchPlaceholder = computed(() => t(props.sourceKind === 'visual-ai'
  ? 'IotSceneLinkage.alarmCondition.searchVisual'
  : 'IotSceneLinkage.alarmCondition.searchIot'))
const filteredRules = computed(() => {
  const normalized = keyword.value.trim().toLocaleLowerCase()
  if (!normalized) return rules.value
  return rules.value.filter(rule => [rule.name, ...rule.lines, ...rule.details.map(item => item.value)]
    .some(value => value.toLocaleLowerCase().includes(normalized)))
})
const selectedRule = computed(() => rules.value.find(rule => rule.id === selectedRuleId.value))
const states = computed(() => [
  ...(props.mode === 'query'
    ? []
    : props.mode === 'trigger'
    ? [
        { value: 'trigger', label: t('IotSceneLinkage.alarmMode.trigger'), description: t('IotSceneLinkage.alarmMode.triggerHint'), icon: 'AlertOutlined' },
        { value: 'relieve', label: t('IotSceneLinkage.alarmMode.relieve'), description: t('IotSceneLinkage.alarmMode.relieveHint'), icon: 'SafetyCertificateOutlined' },
      ]
    : [
        { value: 'warning', label: t('IotSceneLinkage.alarmState.warning'), description: t('IotSceneLinkage.alarmCondition.detailHelp'), icon: 'AlertOutlined' },
        { value: 'normal', label: t('IotSceneLinkage.alarmCondition.normalState'), description: t('IotSceneLinkage.alarmCondition.detailHelp'), icon: 'SafetyCertificateOutlined' },
      ]),
])
const stateTitle = computed(() => props.mode === 'trigger'
  ? t('IotSceneLinkage.alarmCondition.triggerWhen')
  : t('IotSceneLinkage.alarmCondition.currentState'))
const previewLabel = computed(() => t(props.mode === 'query'
  ? 'IotSceneLinkage.summary.queryAlarmRecords'
  : props.mode === 'trigger'
    ? 'IotSceneLinkage.alarmCondition.triggerRule'
    : 'IotSceneLinkage.alarmCondition.previewLabel'))
const previewText = computed(() => {
  const name = selectedRule.value?.name || draft.value.options?.alarmConfigName || t('IotSceneLinkage.alarmCondition.selectRule')
  if (props.mode === 'query') return t('IotSceneLinkage.alarmCondition.queryPreviewText', { name })
  const state = props.mode === 'trigger'
    ? t(`IotSceneLinkage.alarmMode.${draft.value.modes[0] || 'trigger'}`)
    : draft.value.state === 'normal'
      ? t('IotSceneLinkage.alarmCondition.normalState')
      : t('IotSceneLinkage.alarmState.warning')
  return t('IotSceneLinkage.alarmCondition.previewText', { name, state })
})

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

/** 进入弹窗时使用草稿，取消不会让未确认的规则选择写回场景表单。 */
async function resetAndLoad() {
  keyword.value = ''
  draft.value = clone(props.modelValue)
  selectedRuleId.value = draft.value.alarmConfigId
  rules.value = []
  loadError.value = false
  loading.value = true
  try {
    rules.value = props.sourceKind === 'visual-ai'
      ? await loadVisualAlarmRules()
      : await loadIotAlarmRules()
    const selectedFromList = rules.value.find(rule => rule.id === selectedRuleId.value)
    // 分页列表没有返回历史已选规则时，保留历史配置，不能因打开并保存弹窗而替换为首条规则。
    const selected = selectedFromList || selectedRuleFromDraft() || rules.value[0]
    if (selected && !selectedFromList && draft.value.alarmConfigId) rules.value.unshift(selected)
    if (selected) selectRule(selected)
  } catch {
    // Keep a request failure distinct from a successful empty response, so users know to retry rather than recreate a rule.
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function selectedRuleFromDraft(): AlarmRule | undefined {
  const value = clone(draft.value)
  const id = value.alarmConfigId
  const name = value.options?.alarmConfigName || id
  if (!id || !name) return undefined
  if (props.sourceKind === 'visual-ai') {
    const scene = value.options?.sceneName || value.options?.sceneId || '-'
    const algorithm = value.options?.taskTargetName || value.options?.taskTarget || '-'
    return {
      id,
      name,
      lines: [
        t('IotSceneLinkage.alarmCondition.sceneLine', { value: scene }),
        t('IotSceneLinkage.alarmCondition.algorithmLine', { value: algorithm }),
      ],
      details: [
        { label: t('IotSceneLinkage.alarmCondition.scene'), value: scene },
        { label: t('IotSceneLinkage.alarmCondition.algorithm'), value: algorithm },
      ],
      value,
    }
  }
  const product = value.options?.productId || '-'
  const device = value.options?.deviceId || t('IotSceneLinkage.scope.all')
  return {
    id,
    name,
    lines: [
      t('IotSceneLinkage.alarmCondition.productLine', { value: product }),
      t('IotSceneLinkage.alarmCondition.deviceLine', { value: device }),
    ],
    details: [
      { label: t('IotSceneLinkage.form.product'), value: product },
      { label: t('IotSceneLinkage.form.device'), value: device },
    ],
    value,
  }
}

/** 物联告警沿用预处理器 ID 作为 alarmConfigId，避免改变运行时规则契约。 */
async function loadIotAlarmRules(): Promise<AlarmRule[]> {
  const result = normalizeResult(await queryDeviceAlarmPreprocesses({
    pageIndex: 0,
    pageSize: 200,
    terms: [],
    sorts: [{ name: 'createTime', order: 'desc' }],
  }))
  const productIds = [...new Set(result.data.map((item: Record<string, any>) => String(item.templateId || item.alarm?.templateId || '')).filter(Boolean))]
  const products = await Promise.all(productIds.map(async id => {
    const response: any = await getProduct(id)
    const product = response?.result ?? response
    return [id, product?.name || id] as const
  }))
  const productNames = Object.fromEntries(products)
  const deviceIds = [...new Set(result.data.map((item: Record<string, any>) => String(item.alarm?.thingId || '')).filter(id => id && id !== '@all'))]
  const devices = deviceIds.length
    ? normalizeResult(await queryDevicesPage({ pageIndex: 0, pageSize: Math.max(deviceIds.length, 20), terms: [{ column: 'id', termType: 'in', value: deviceIds }] })).data
    : []
  const deviceNames = Object.fromEntries(devices.map((item: Record<string, any>) => [String(item.id), item.name || item.id]))

  return result.data.flatMap((item: Record<string, any>) => {
    const alarm = item.alarm || {}
    const processor = (alarm.configuration?.processors || []).find((entry: Record<string, any>) => entry.provider === 'device-alarm')
    const id = String(alarm.id || '')
    const name = processor?.configuration?.alarmName || item.propertyName || alarm.name
    if (!id || !name) return []
    const productId = String(item.templateId || alarm.templateId || '')
    const deviceId = String(alarm.thingId || '')
    const propertyName = item.propertyName || alarm.propertyName || alarm.property || ''
    const matcher = alarm.configuration?.matcher || {}
    const matcherConfig = matcher.configuration || {}
    const alarmCondition = matcher.provider === 'number-range'
      ? formatTriggerText({ propertyName, trigger: matcherConfig.not === false ? 'inside' : 'outside', limit: { lower: matcherConfig.min, upper: matcherConfig.max } })
      : propertyName
    const productName = productNames[productId] || productId
    const deviceName = deviceId && deviceId !== '@all'
      ? deviceNames[deviceId] || deviceId
      : t('IotSceneLinkage.scope.all')
    return [{
      id,
      name,
      level: Number(processor?.configuration?.alarmLevel) || undefined,
      lines: [
        t('IotSceneLinkage.alarmCondition.productLine', { value: productName }),
        t('IotSceneLinkage.alarmCondition.deviceLine', { value: deviceName }),
        alarmCondition ? t('IotSceneLinkage.alarmCondition.triggerLine', { value: alarmCondition }) : '',
      ].filter(Boolean),
      details: [
        { label: t('IotSceneLinkage.form.product'), value: productName },
        { label: t('IotSceneLinkage.form.device'), value: deviceName },
        { label: t('IotSceneLinkage.alarmCondition.triggerCondition'), value: alarmCondition || '-' },
      ],
      value: {
        sourceKind: 'iot-device',
        targetType: 'device',
        modes: [],
        state: draft.value.state || 'warning',
        alarmConfigId: id,
        options: { productId, productName, deviceId: deviceId === '@all' ? undefined : deviceId, deviceName, alarmConfigName: name },
      },
    }]
  })
}

function alarmLevelText(level: number) {
  const keys = ['emergency', 'urgent', 'severity', 'ordinary', 'warn']
  return t(`DeviceAlarm.level.${keys[level - 1] || 'ordinary'}`)
}

function alarmLevelColor(level: number) {
  if (level <= 2) return 'error'
  if (level === 3) return 'warning'
  if (level === 4) return 'processing'
  return 'default'
}

/** 视觉告警使用既有聚合任务列表；不把原型中的演示字段映射为新的后台字段。 */
async function loadVisualAlarmRules(): Promise<AlarmRule[]> {
  const scenePage = await queryAiAlarmSceneTree({
    pageIndex: 0,
    pageSize: 200,
    terms: [],
    sorts: [{ name: 'createTime', order: 'desc' }],
  })
  const scenes = normalizeResult<AiSceneTreeOption>(scenePage)
  const sceneNames = Object.fromEntries(scenes.data.map(scene => [scene.id, scene.name || scene.id]))
  // 聚合任务接口按场景查询才会返回告警任务；无筛选全量查询会漏掉当前用户可见的视觉告警配置。
  const taskPages = await Promise.all(scenes.data.map(scene => queryAiAggregateTasks({
    pageIndex: 0,
    pageSize: 200,
    terms: [{ column: 'sceneId', termType: 'eq', value: scene.id }],
    sorts: [{ name: 'createTime', order: 'desc' }],
  })))
  const tasks = {
    data: taskPages.flatMap(page => normalizeResult<AiAggregateTaskOption>(page).data),
  }
  return tasks.data.flatMap(task => {
    const target = task.taskTargets?.[0]
    const sceneName = sceneNames[task.sceneId] || task.sceneId
    const targetName = target?.text || target?.value || '-'
    const videoCount = task.videoCount ?? 0
    return [{
      id: String(task.id),
      name: task.name || task.id,
      lines: [
        t('IotSceneLinkage.alarmCondition.sceneLine', { value: sceneName }),
        t('IotSceneLinkage.alarmCondition.algorithmLine', { value: targetName }),
        t('IotSceneLinkage.alarmCondition.cameraLine', { count: videoCount }),
      ],
      details: [
        { label: t('IotSceneLinkage.alarmCondition.scene'), value: sceneName },
        { label: t('IotSceneLinkage.alarmCondition.algorithm'), value: targetName },
        { label: t('IotSceneLinkage.alarmCondition.camera'), value: t('IotSceneLinkage.aiEvent.option.videoCount', { count: videoCount }) },
      ],
      value: {
        sourceKind: 'visual-ai',
        targetType: 'aiTaskMediaTarget',
        modes: [],
        state: draft.value.state || 'warning',
        alarmConfigId: String(task.id),
        options: {
          sceneId: task.sceneId,
          sceneName,
          taskTarget: target?.value,
          taskTargetName: targetName,
          alarmConfigName: task.name || task.id,
        },
      },
    }]
  })
}

function selectRule(rule: AlarmRule) {
  selectedRuleId.value = rule.id
  const current = draft.value
  // 重新打开并确认同一条历史规则时保留 options 中未被快速配置识别的字段。
  draft.value = current.alarmConfigId === rule.id
    ? {
        ...rule.value,
        ...current,
        sourceKind: rule.value.sourceKind,
        targetType: rule.value.targetType,
        state: current.state || rule.value.state || 'warning',
        options: { ...rule.value.options, ...current.options },
      }
    : { ...rule.value, state: current.state || 'warning' }
}

function isStateSelected(value: string) {
  return props.mode === 'trigger'
    ? draft.value.modes.includes(value as 'trigger' | 'relieve')
    : draft.value.state === value
}

/** Trigger and condition use one selection shell but persist different existing alarm fields. */
function changeState(value: string) {
  draft.value = props.mode === 'trigger'
    ? { ...draft.value, modes: [value as 'trigger' | 'relieve'] }
    : { ...draft.value, state: value as 'warning' | 'normal' }
}

function save() {
  emit('update:modelValue', clone(draft.value))
  emit('save')
}

// 新增附加条件时组件与打开状态会在同一渲染周期创建；立即执行才能避免首次弹窗不发查询。
watch(() => props.open, open => { if (open) void resetAndLoad() }, { immediate: true })
</script>

<style scoped>
.alarm-condition-modal { display: grid; grid-template-columns: 390px minmax(0, 1fr); min-height: 520px; border: 1px solid #eef0f3; border-radius: 8px; }
.alarm-condition-modal__rules { display: flex; flex-direction: column; min-width: 0; padding: 16px; border-right: 1px solid #eef0f3; }
.alarm-condition-modal__rules-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }.alarm-condition-modal__rules-title span { color: var(--ant-color-text-tertiary); font-size: 12px; }
.alarm-condition-modal__rule-list { display: grid; gap: 8px; max-height: 410px; margin-top: 12px; overflow: auto; padding-right: 4px; }
.alarm-condition-modal__rule { display: grid; gap: 5px; padding: 12px; text-align: left; cursor: pointer; background: var(--ant-color-bg-container); border: 1px solid transparent; border-radius: 8px; }.alarm-condition-modal__rule:hover { background: #f7faff; border-color: #b7d2ff; }.alarm-condition-modal__rule--selected { background: #f4f8ff; border-color: var(--ant-color-primary); }
.alarm-condition-modal__rule-head { display: flex; gap: 8px; align-items: center; min-width: 0; }.alarm-condition-modal__rule-name { flex: 1; min-width: 0; overflow: hidden; color: var(--ant-color-text); font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }.alarm-condition-modal__rule-line { color: var(--ant-color-text-secondary); font-size: 12px; line-height: 18px; }
.alarm-condition-modal__detail { display: flex; flex-direction: column; min-width: 0; padding: 24px 20px; }.alarm-condition-modal__detail > :last-child { margin-block: auto; }
.alarm-condition-modal__detail-header { display: flex; gap: 12px; align-items: center; }.alarm-condition-modal__detail-header > div { display: grid; flex: 1; gap: 2px; min-width: 0; }.alarm-condition-modal__detail-header small { color: var(--ant-color-text-tertiary); }.alarm-condition-modal__detail-header > .anticon { color: var(--ant-color-text-tertiary); }
.alarm-condition-modal__detail-icon { display: grid; place-items: center; width: 36px; height: 36px; color: var(--ant-color-primary); background: #eef5ff; border-radius: 8px; }
.alarm-condition-modal__detail-list { display: grid; grid-template-columns: 110px minmax(0, 1fr); margin: 20px 0 24px; border: 1px solid #f0f1f3; border-radius: 8px; overflow: hidden; }.alarm-condition-modal__detail-list dt, .alarm-condition-modal__detail-list dd { min-height: 39px; margin: 0; padding: 10px 14px; border-bottom: 1px solid #f0f1f3; }.alarm-condition-modal__detail-list dt:nth-last-of-type(1), .alarm-condition-modal__detail-list dd:last-child { border-bottom: 0; }.alarm-condition-modal__detail-list dt { color: var(--ant-color-text-tertiary); background: #fafbfc; }.alarm-condition-modal__detail-list dd { overflow: hidden; color: var(--ant-color-text); font-weight: 500; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.alarm-condition-modal__state { display: grid; gap: 12px; }.alarm-condition-modal__state-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.alarm-condition-modal__state-option { display: flex; gap: 8px; align-items: center; min-height: 56px; padding: 0 14px; color: var(--ant-color-text-secondary); cursor: pointer; background: var(--ant-color-bg-container); border: 1px solid #d9e2ef; border-radius: 8px; }.alarm-condition-modal__state-option b { color: inherit; }.alarm-condition-modal__state-option > :last-child { margin-left: auto; color: var(--ant-color-text-tertiary); }.alarm-condition-modal__state-option--selected { color: var(--ant-color-primary); background: #edf5ff; border-color: var(--ant-color-primary); }
.alarm-condition-modal__preview { grid-column: 2; display: flex; gap: 8px; align-items: center; min-height: 42px; margin: 0 20px 20px; padding: 0 14px; color: var(--ant-color-text-secondary); background: #fbfdff; border: 1px dashed #91caff; border-radius: 8px; }.alarm-condition-modal__preview b { color: var(--ant-color-primary); }.alarm-condition-modal__preview span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.alarm-condition-modal__footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
@media (max-width: 760px) { .alarm-condition-modal { grid-template-columns: 1fr; }.alarm-condition-modal__rules { border-right: 0; border-bottom: 1px solid #eef0f3; }.alarm-condition-modal__preview { grid-column: 1; }.alarm-condition-modal__rule-list { max-height: 220px; } }
</style>
