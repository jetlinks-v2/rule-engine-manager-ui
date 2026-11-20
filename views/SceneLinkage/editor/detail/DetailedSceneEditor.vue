<template>
  <main class="detailed-scene-editor">
    <!-- 原版动作会主动通知 change，显式使用 submit，让保存时的 validate() 统一执行校验。 -->
    <a-form ref="sceneForm" :model="data" validate-trigger="submit" :validate-on-rule-change="false" :colon="false" layout="vertical" class="detailed-scene-editor__form">
      <SceneEditorWorkspace mode="detail" :show-mode-switch="showModeSwitch" :saving="saving" v-model:description="data.description" @back="$emit('cancel')" @switch-mode="switchToQuick">
        <template #name>
          <a-form-item class="detailed-scene-editor__name-field" :label="$t('IotSceneLinkage.form.sceneName')" name="name" :rules="nameRules">
            <a-input v-model:value="data.name" class="scene-editor__name" :placeholder="$t('IotSceneLinkage.placeholder.editorName')" />
          </a-form-item>
        </template>
        <template #preview>
          <DetailedSceneRuleSummary
            :rule="data"
            :trigger-providers="triggerProviders"
            :action-providers="actionOptions"
            :term-columns="termColumns"
            @change="updateSummary"
            @title-change="updateSummaryTitle"
          />
        </template>
      <section class="detailed-scene-editor__section">
        <DetailedEditorSectionHeader kind="trigger" />
        <div class="detailed-scene-editor__section-body">
          <div class="detailed-scene-editor__configuration-panel detailed-scene-editor__configuration-panel--triggers">
            <a-form-item v-if="!data.triggerType" name="triggerType" :rules="triggerRules">
              <p class="scene-editor__empty-hint detailed-scene-editor__trigger-hint">{{ $t('IotSceneLinkage.editor.triggerEmptyHint') }}</p>
              <a-button block class="detailed-scene-editor__trigger-add" @click="triggerPickerVisible = true">
                <AIcon type="PlusOutlined" />{{ $t('IotSceneLinkage.detail.addTriggerRule') }}
              </a-button>
            </a-form-item>
            <template v-else>
              <DetailedTriggerNode v-if="data.triggerType === 'manual'" :rule="data" @remove="removeTrigger" />
              <DetailedTimerTrigger v-else-if="data.triggerType === 'timer'" ref="timerTriggerRef" @cancel-config="cancelNewTrigger" @save-config="triggerPending = false" @remove="removeTrigger" />
              <Device v-else-if="data.triggerType === 'device'" ref="deviceRef" :show-terms="false" :show-title="false" card-layout @cancel-config="cancelNewTrigger" @save-config="completeTriggerConfig" @remove="removeTrigger" />
              <Collector v-else-if="data.triggerType === 'collector'" ref="collectorRef" :show-terms="false" :show-title="false" @cancel-config="cancelNewTrigger" @save-config="completeTriggerConfig" card-layout @remove="removeTrigger" />
              <DetailedMultiTriggerConfig v-else-if="data.triggerType === 'multi'" ref="multiTriggerRef" v-model="data.trigger" :trigger-options="multiTriggerOptions" :collapse-to-single="lockedTriggerRoot !== 'multi'" @collapse="restoreSingleTrigger" />
              <SaasTriggerConfig ref="saasTriggerRef" v-else-if="['alarm', 'ai-event'].includes(data.triggerType)" @cancel-config="cancelNewTrigger" @save-config="completeTriggerConfig" @remove="removeTrigger" />
              <section v-else-if="data.triggerType" class="detailed-scene-editor__provider-placeholder">
                <a-empty :description="$t('IotSceneLinkage.message.detailProviderPending', { provider: data.triggerType })" />
              </section>
              <div v-if="showTriggerRuleActions && !['manual', 'device', 'timer', 'collector', 'alarm', 'ai-event'].includes(data.triggerType)" class="detailed-scene-editor__trigger-rule-actions">
                <a-tooltip v-if="canEditTrigger" :title="$t('IotSceneLinkage.action.edit')">
                  <a-button type="text" :aria-label="$t('IotSceneLinkage.action.edit')" @click="editCurrentTrigger"><AIcon type="EditOutlined" /></a-button>
                </a-tooltip>
                <a-tooltip v-if="canRemoveTrigger" :title="$t('IotSceneLinkage.action.delete')">
                  <a-button type="text" danger :aria-label="$t('IotSceneLinkage.action.delete')" @click="removeTrigger"><AIcon type="DeleteOutlined" /></a-button>
                </a-tooltip>
              </div>
              <a-button
                v-if="canConvertToMulti"
                block
                class="detailed-scene-editor__multi-trigger-add"
                @click="convertTriggerToMulti"
              >
                <AIcon type="PlusOutlined" />{{ $t('IotSceneLinkage.detail.addTriggerRule') }}
              </a-button>
            </template>
          </div>
        </div>
      </section>
      <section class="detailed-scene-editor__section detailed-scene-editor__execution-section">
        <DetailedEditorSectionHeader kind="action" />
        <div class="detailed-scene-editor__section-body">
          <div class="detailed-scene-editor__configuration-panel">
            <DetailedSceneExecution :rule="data" :trigger-type="data.triggerType" :trigger-ready="Boolean(data.triggerType) && !triggerPending" />
          </div>
        </div>
      </section>
      </SceneEditorWorkspace>
    </a-form>
    <SceneEditorFooter>
      <a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
      <j-permission-button type="primary" :hasPermission="savePermission" :loading="saving" @click="save">{{ $t('IotSceneLinkage.action.saveScene') }}</j-permission-button>
    </SceneEditorFooter>
    <TriggerPickerModal
      :open="triggerPickerVisible"
      mode="provider"
      :title="$t('IotSceneLinkage.detail.triggerRule')"
      :hint="$t('IotSceneLinkage.editor.triggerPickerHint')"
      :options="triggerOptions"
      @cancel="triggerPickerVisible = false"
      @select="selectTriggerFromPicker"
    />
  </main>
</template>
<script setup lang="ts">
import DetailedEditorSectionHeader from './DetailedEditorSectionHeader.vue'
import SceneEditorFooter from '../components/SceneEditorFooter.vue'
import { useSceneDraftChanges } from '../useSceneLeaveGuard'
import type { PreviewColumns } from './detailedRuleSummaryParts'
import { computed, nextTick, onMounted, provide, ref, watch, type PropType } from 'vue'
import { cloneDeep } from 'lodash-es'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { useI18n } from 'vue-i18n'
import { querySceneSupportedActions, type SceneProviderInfo } from '../../../../api/scene-linkage'
import { useSceneTermColumns } from '../../../Scene/Save/components/Terms/useSceneTermColumns'
import DetailedTriggerNode from './DetailedTriggerNode.vue'
import Device from '../../../Scene/Save/Device/index.vue'
import Collector from '../../../Scene/Save/Collector/index.vue'
import SaasTriggerConfig from './SaasTriggerConfig.vue'
import DetailedMultiTriggerConfig from './DetailedMultiTriggerConfig.vue'
import DetailedSceneRuleSummary from './DetailedSceneRuleSummary.vue'
import DetailedSceneExecution from './DetailedSceneExecution.vue'
import DetailedTimerTrigger from './DetailedTimerTrigger.vue'
import SceneEditorWorkspace from '../components/SceneEditorWorkspace.vue'
import TriggerPickerModal, { type TriggerPickerOption } from '../components/TriggerPickerModal.vue'
import { MULTI_TRIGGER_PROVIDERS, normalizeResult } from '../../utils'
import { type SceneEditorMode, type SceneRuleRecord } from '../editorMode'
import { findSceneCondition } from '../../sceneRule'
import { useDetailedSceneDraft } from './useDetailedSceneDraft'
import { assignmentKey, defaultBranches } from '@rule-engine-manager-ui/store/scene'
import { SCENE_TRIGGER_CATEGORIES, SCENE_TRIGGER_CATEGORY_ORDER } from '../triggerPickerOptions'
import { provideSceneNotifyLabels } from './useSceneNotifyLabels'
const props = defineProps({
  rule: {
    type: Object as PropType<SceneRuleRecord>,
    required: true,
  },
  showModeSwitch: {
    type: Boolean,
    default: false,
  },
  supportedTriggers: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  triggerProviders: {
    type: Array as PropType<SceneProviderInfo[]>,
    default: () => [],
  },
  lockedTriggerProviders: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  lockedTriggerRoot: {
    type: String,
    default: '',
  },
  saving: {
    type: Boolean,
    default: false,
  },
  savePermission: {
    type: String,
    required: true,
  },
})
const emit = defineEmits<{
  cancel: []
  'dirty-change': [dirty: boolean]
  save: [rule: SceneRuleRecord]
  'switch-mode': [mode: SceneEditorMode, draft: SceneRuleRecord]
}>()
const { t } = useI18n()
const sceneForm = ref()
const deviceRef = ref()
const timerTriggerRef = ref<{ openConfig: () => void }>()
const collectorRef = ref<{ openConfig: () => void }>()
const multiTriggerRef = ref<{ validate: () => string | undefined; openPicker: () => void }>()
const saasTriggerRef = ref<{ validate: () => string | undefined; openConfig: () => void }>()
const actionOptions = ref<SceneProviderInfo[]>([])
const termColumns = ref<PreviewColumns>({})
const { queryTermColumns } = useSceneTermColumns()
const readOnlyActionProviders = ref(['alarm', 'notify'])
const triggerPickerVisible = ref(false)
const { data, load, getDraft } = useDetailedSceneDraft()
const draftChanges = useSceneDraftChanges(() => data.value)
watch(draftChanges.dirty, dirty => emit('dirty-change', dirty), { immediate: true, flush: 'sync' })
provideSceneNotifyLabels(data)
const nameRules = [{ required: true, message: t('IotSceneLinkage.message.nameRequired') }]
const triggerRules = [{ required: true, message: t('IotSceneLinkage.message.triggerRequired') }]
provide('action-options', actionOptions)
provide('readonly-action-providers', readOnlyActionProviders)
// 详细模式复用原版动作树，但其资源选择入口需要采用新版范围选择流程。
provide('scene-editor-mode', 'detail')
const triggerIcons: Record<string, string> = {
  device: 'ApiOutlined',
  timer: 'ClockCircleOutlined',
  collector: 'DatabaseOutlined',
  alarm: 'AlertOutlined',
  'ai-event': 'RadarChartOutlined',
  manual: 'ThunderboltOutlined',
  multi: 'ClusterOutlined',
}
const alarmPickerKinds = new Set(['iot-alarm', 'visual-alarm'])

/** Provider 可能返回 i18n key 或已翻译文案，两种响应都统一为最终显示文本。 */
function resolveProviderText(value: string | undefined, fallbackKey: string) {
  return value?.startsWith('IotSceneLinkage.') ? t(value) : value || t(fallbackKey)
}
/**
 * 共有入口复用快速模式的名称和说明，详细模式独有 Provider 保留后端返回的文案。
 */
function toTriggerPickerOption(item: SceneProviderInfo): TriggerPickerOption {
  const category = SCENE_TRIGGER_CATEGORIES[item.provider as keyof typeof SCENE_TRIGGER_CATEGORIES]
  return {
    value: item.provider,
    provider: item.provider,
    icon: triggerIcons[item.provider] || 'ThunderboltOutlined',
    label: category ? t(category.label) : resolveProviderText(item.name, `IotSceneLinkage.triggerType.${item.provider}`),
    description: category ? t(category.description) : resolveProviderText(item.description, `IotSceneLinkage.triggerTypeDesc.${item.provider}`),
  }
}
const triggerOptions = computed<TriggerPickerOption[]>(() => props.triggerProviders
  // 多条件由“添加触发规则”自动升级，不作为独立的首次触发方式入口。
  .filter(item => item.provider !== 'multi' && props.supportedTriggers.includes(item.provider))
  .flatMap(item => {
    const disabled = Boolean(props.lockedTriggerProviders.length && !props.lockedTriggerProviders.includes(item.provider))
    const disabledReason = 'IotSceneLinkage.message.triggerProviderLocked'
    if (item.provider === 'alarm') {
      return [
        { value: 'iot-alarm', provider: 'alarm', icon: 'AlertOutlined', label: t('IotSceneLinkage.triggerCategory.iotAlarm'), description: t('IotSceneLinkage.triggerCategoryDesc.iotAlarm'), disabled, disabledReason },
        { value: 'visual-alarm', provider: 'alarm', icon: 'EyeOutlined', label: t('IotSceneLinkage.triggerCategory.visualAlarm'), description: t('IotSceneLinkage.triggerCategoryDesc.visualAlarm'), disabled, disabledReason },
      ]
    }
    return [{ ...toTriggerPickerOption(item), disabled, disabledReason }]
  }).sort((left, right) => {
    const rank = (value: string) => {
      const index = SCENE_TRIGGER_CATEGORY_ORDER.indexOf(value)
      return index < 0 ? SCENE_TRIGGER_CATEGORY_ORDER.length : index
    }
    return rank(left.value) - rank(right.value)
  }))
// 首次与追加使用相同 Provider 入口，设备、定时的细分方式在后续配置弹窗选择。
const multiTriggerOptions = computed<TriggerPickerOption[]>(() => triggerOptions.value.map(item => ({
  ...item,
  value: item.provider === 'device' ? 'property' : item.provider === 'timer' ? 'repeat' : item.value,
  disabled: item.disabled || !MULTI_TRIGGER_PROVIDERS.some(provider => provider === item.provider),
  disabledReason: item.disabled ? item.disabledReason : 'IotSceneLinkage.message.multiTriggerProviderUnsupported',
})))
const canConvertToMulti = computed(() => data.value.triggerType !== 'multi'
  && MULTI_TRIGGER_PROVIDERS.some(type => type === data.value.triggerType)
  && props.supportedTriggers.includes('multi'))
const canEditTrigger = computed(() => ['device', 'timer', 'collector'].includes(String(data.value.triggerType)))
const canRemoveTrigger = computed(() => Boolean(data.value.triggerType) && data.value.triggerType !== 'multi')
const showTriggerRuleActions = computed(() => canEditTrigger.value || canRemoveTrigger.value)
/** 原版触发组件通过 trigger.type 和 triggerType 同时读取触发器类型。 */
function changeTrigger(triggerType: string) {
  data.value.triggerType = triggerType
  // 原版手动、定时创建时没有默认条件；隐藏的空占位组不能进入保存请求。
  if (['manual', 'timer'].includes(triggerType)) {
    for (const branch of data.value.branches || []) {
      if (branch && !findSceneCondition(branch.when, term => Boolean(term.column))) branch.when = []
    }
  }
  data.value.trigger = triggerType === 'multi'
    ? { type: 'multi', multi: { triggers: [] } }
    : { type: triggerType }
}

const triggerPending = ref(false)
let pendingTriggerSnapshot: SceneRuleRecord | undefined

/** 确认触发规则后展开首分支的条件输入，已有过滤条件和动作保持原值。 */
function completeTriggerConfig() {
  triggerPending.value = false
  pendingTriggerSnapshot = undefined
  const branch = data.value.branches?.[0]
  if (!branch || branch.when?.length) return
  branch.when = assignmentKey(cloneDeep(defaultBranches[0].when))
  const option = data.value.options?.when?.[0]
  if (option) option.terms = [{ terms: [['', 'eq', '', 'and']] }]
}

async function selectTriggerFromPicker(pickerType: string) {
  triggerPickerVisible.value = false
  const triggerType = alarmPickerKinds.has(pickerType) ? 'alarm' : pickerType
  // 编辑场景删除后仍可重选，但不能通过选择器回调绕过已保存 Provider 的限制。
  if (props.lockedTriggerProviders.length && !props.lockedTriggerProviders.includes(triggerType)) return
  // 重选当前触发方式不能清空已经填写的原版触发器配置。
  if (data.value.triggerType === triggerType) return
  triggerPending.value = triggerType !== 'manual'
  pendingTriggerSnapshot = triggerPending.value ? getDraft() : undefined
  changeTrigger(triggerType)
  if (triggerType === 'alarm') {
    data.value.trigger = { type: 'alarm', configuration: { sourceKind: pickerType === 'visual-alarm' ? 'visual-ai' : 'iot-device' } }
  }
  // 选择后直接进入对应配置，避免把“选择类型”和“填写规则”拆成两步。
  await nextTick()
  if (triggerType === 'device') deviceRef.value?.openConfig()
  else if (triggerType === 'timer') timerTriggerRef.value?.openConfig()
  else if (triggerType === 'collector') collectorRef.value?.openConfig()
  else if (triggerType === 'alarm' || triggerType === 'ai-event') saasTriggerRef.value?.openConfig()
}

/** 与快速模式保持一致：已选规则提供显式编辑入口，但已保存规则不允许更换类型。 */
function editCurrentTrigger() {
  if (data.value.triggerType === 'device') deviceRef.value?.openConfig()
  else if (data.value.triggerType === 'timer') timerTriggerRef.value?.openConfig()
  else if (data.value.triggerType === 'collector') collectorRef.value?.openConfig()
}

/** 已保存场景也允许删除后重配；Provider 锁独立于草稿，因此不会被这一步清空。 */
function removeTrigger() {
  triggerPending.value = false
  data.value.triggerType = ''
  data.value.trigger = {}
  sceneForm.value?.clearValidate?.('triggerType')
}

/** 与快速模式一致：取消新建会撤销占位节点；取消编辑只丢弃弹窗草稿。 */
function cancelNewTrigger() {
  if (!triggerPending.value) return
  // 选择类型会整理空条件；取消时恢复打开前的完整草稿，避免无修改也被判为未保存。
  if (pendingTriggerSnapshot) data.value = pendingTriggerSnapshot
  else removeTrigger()
  pendingTriggerSnapshot = undefined
  triggerPending.value = false
}

/** 多条件删除至一条时回到普通触发器，避免把单条规则误展示为组合规则。 */
function restoreSingleTrigger(value: { triggerType: string; trigger: Record<string, any>; options?: Record<string, any> }) {
  data.value.triggerType = value.triggerType
  data.value.trigger = value.trigger
  if (value.options) data.value.options = { ...data.value.options, trigger: value.options }
}

/**
 * 仅转换前后端约定可组合的 Provider。转换时保留原始触发器节点，
 * 只替换触发根节点，不触碰详细分支、条件和执行动作。
 */
async function convertTriggerToMulti() {
  // 连续点击或旧渲染事件只能打开现有 multi，不能再次把整棵 multi 包装为叶子。
  if (data.value.trigger?.type === 'multi') {
    data.value.triggerType = 'multi'
    await nextTick()
    multiTriggerRef.value?.openPicker()
    return
  }
  const trigger = cloneDeep(data.value.trigger || { type: data.value.triggerType })
  data.value.triggerType = 'multi'
  data.value.trigger = { type: 'multi', multi: { triggers: [{ index: 1, trigger, terms: [], options: cloneDeep(data.value.options?.trigger || {}) }] } }
  // multi 容器在切换类型后才挂载，等待渲染完成再打开新增叶子的选择器。
  await nextTick()
  multiTriggerRef.value?.openPicker()
}

async function loadActionOptions() {
  const response = await querySceneSupportedActions()
  actionOptions.value = normalizeResult<SceneProviderInfo>(response).data
    // 旧 notify 与场景告警动作仅用于历史数据只读兼容；告警记录查询仍是详细模式的普通动作。
    .filter(item => !['notify', 'alarm', 'trigger', 'relieve'].includes(item.provider))
    .map(item => ({
      ...item,
      value: item.provider,
      label: item.name || item.provider,
      subLabel: item.description,
    }))
}

/** 保留后端字段名称、枚举与操作符元数据；同名列按事件源索引区分，不把内部路径直接展示给用户。 */
function toTermColumnMap(columns: any[]): PreviewColumns {
  return columns.reduce((result, item) => {
    if (item?.column) {
      const index = item.others?._multiTriggerIndex
      if (index !== undefined) result[`${index}:${item.column}`] = item
      if (!result[item.column]) result[item.column] = item
    }
    return { ...result, ...toTermColumnMap(item?.children || []) }
  }, {} as PreviewColumns)
}

let latestTermColumnsRequest = 0

const asRuleRecord = (value: unknown): SceneRuleRecord => value && typeof value === 'object' && !Array.isArray(value)
  ? value as SceneRuleRecord
  : {}

/**
 * 字段解析接口只接受已完成的条件叶子；原版编辑器的新建占位项没有 column，
 * 因此必须在预览请求前剔除，不能让纯展示能力阻断详细模式切换。
 */
function normalizeParseConditions(value: unknown): SceneRuleRecord[] {
  return (Array.isArray(value) ? value : []).flatMap((item): SceneRuleRecord[] => {
    const condition = asRuleRecord(item)
    if (condition.column) return [condition]
    const terms = normalizeParseConditions(condition.terms)
    return terms.length ? [{ ...condition, terms }] : []
  })
}

/** 为字段名称预览构造最小有效请求，不改变详细模式会话中的原始规则树。 */
function createTermColumnsDraft(): SceneRuleRecord | undefined {
  const draft = cloneDeep(data.value)
  const trigger = asRuleRecord(draft.trigger)
  // 未选触发器、或只有编辑器占位条件时没有可解析上下文，不发起接口请求。
  if (!trigger.type) return undefined
  // multi 的占位叶子还没有 Provider，保留原始索引，等所有叶子具备类型后再解析字段。
  const completeTrigger = (node: SceneRuleRecord): boolean => Boolean(node.type) && (node.type !== 'multi'
    || Boolean(node.multi?.triggers?.length && node.multi.triggers.every((item: SceneRuleRecord) => completeTrigger(asRuleRecord(item.trigger)))))
  if (!completeTrigger(trigger)) return undefined

  const branches = (Array.isArray(draft.branches) ? draft.branches : []).flatMap((item): SceneRuleRecord[] => {
    const branch = asRuleRecord(item)
    const when = normalizeParseConditions(branch.when)
    return when.length ? [{ ...branch, when }] : []
  })
  if (!branches.length && !normalizeParseConditions(draft.terms).length && trigger.type !== 'multi') return undefined

  draft.branches = branches
  const options = asRuleRecord(draft.options)
  draft.options = {
    ...options,
    when: normalizeParseConditions(options.when),
  }
  return draft
}

async function loadTermColumns() {
  const requestId = ++latestTermColumnsRequest
  const draft = createTermColumnsDraft()
  if (!draft) {
    termColumns.value = {}
    return
  }
  try {
    const response = await queryTermColumns(draft)
    if (requestId === latestTermColumnsRequest) termColumns.value = toTermColumnMap(response?.result || [])
  } catch {
    // 字段解析失败时仍保留已存展示名称，缺失名称时展示可读提示，不能阻断详细规则编辑。
    if (requestId === latestTermColumnsRequest) termColumns.value = {}
  }
}

function updateSummary(value: string) {
  data.value.options = {
    ...(data.value.options || {}),
    summary: value,
  }
}

function updateSummaryTitle(value: string) {
  data.value.options = {
    ...(data.value.options || {}),
    summaryTitle: value,
  }
}

/** 保存前由原版表单校验必填项，再把当前会话数据交给上层统一规则树。 */
async function validateDraft() {
  const result = await sceneForm.value?.validate().catch(() => undefined)
  if (!result) {
    onlyMessage(t('IotSceneLinkage.message.detailIncomplete'), 'warning')
    return
  }
  const validationMessage = data.value.triggerType === 'multi'
    ? multiTriggerRef.value?.validate()
    : ['alarm', 'ai-event'].includes(data.value.triggerType || '')
      ? saasTriggerRef.value?.validate()
      : undefined
  if (validationMessage) {
    onlyMessage(t(validationMessage), 'warning')
    return
  }
  return getDraft()
}

async function save() {
  const draft = await validateDraft()
  if (draft) emit('save', draft)
}

defineExpose({ validateDraft })

function switchToQuick() {
  emit('switch-mode', 'quick', getDraft())
}

let draftLoadVersion = 0
watch(() => props.rule, async rule => {
  const version = ++draftLoadVersion
  pendingTriggerSnapshot = undefined
  triggerPending.value = false
  load(rule)
  await nextTick()
  if (version === draftLoadVersion) draftChanges.markClean()
}, { immediate: true, deep: true })
// 字段名称只依赖触发器与条件树；不要监听完整草稿，以免名称、说明等编辑触发无关请求。
watch(() => ({ trigger: data.value.trigger, branches: data.value.branches }), loadTermColumns, { deep: true, immediate: true })
onMounted(() => void loadActionOptions())
</script>
