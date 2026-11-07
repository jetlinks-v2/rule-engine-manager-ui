<template>
  <main class="detailed-scene-editor">
    <PageHeader
      show-back
      class="scene-editor__page-header detailed-scene-editor__page-header"
      :title="$t('IotSceneLinkage.action.backToSceneList')"
      @back="$emit('cancel')"
    >
      <template #actions>
        <div class="scene-editor__header-actions">
          <a-radio-group :value="'detail'" button-style="solid" @change="switchToQuick">
            <a-radio-button value="quick">{{ $t('IotSceneLinkage.editor.quickMode') }}</a-radio-button>
            <a-radio-button value="detail">{{ $t('IotSceneLinkage.editor.detailMode') }}</a-radio-button>
          </a-radio-group>
        </div>
      </template>
    </PageHeader>
    <a-form ref="sceneForm" :model="data" :colon="false" layout="vertical" class="detailed-scene-editor__form">
      <section class="detailed-scene-editor__overview">
        <section class="scene-editor__scene-meta">
          <a-form-item class="detailed-scene-editor__name-field" :label="$t('IotSceneLinkage.form.sceneName')" name="name" :rules="nameRules">
            <a-input v-model:value="data.name" class="scene-editor__name" :placeholder="$t('IotSceneLinkage.placeholder.editorName')" />
          </a-form-item>
          <a-form-item class="detailed-scene-editor__description-field" :label="$t('IotSceneLinkage.form.description')" name="description">
            <a-textarea v-model:value="data.description" :auto-size="{ minRows: 2, maxRows: 3 }" :placeholder="$t('IotSceneLinkage.placeholder.description')" />
          </a-form-item>
        </section>
        <RulePreviewCard>
          <DetailedSceneRuleSummary
            :rule="data"
            :trigger-providers="triggerProviders"
            :action-providers="actionOptions"
            :term-columns="termColumns"
            @change="updateSummary"
            @title-change="updateSummaryTitle"
          />
        </RulePreviewCard>
      </section>
      <section class="detailed-scene-editor__section">
        <header class="detailed-scene-editor__section-header">
          <span class="detailed-scene-editor__section-icon"><AIcon type="ThunderboltOutlined" /></span>
          <div><h2>{{ $t('IotSceneLinkage.detail.triggerRule') }}</h2><p>{{ $t('IotSceneLinkage.detail.triggerRuleHint') }}</p></div>
        </header>
        <div class="detailed-scene-editor__section-body">
          <div class="detailed-scene-editor__configuration-panel">
            <a-form-item v-if="!data.triggerType" name="triggerType" :rules="triggerRules">
              <a-button block class="detailed-scene-editor__trigger-add" @click="triggerPickerVisible = true">
                <AIcon type="PlusOutlined" />{{ $t('IotSceneLinkage.detail.addTriggerRule') }}
              </a-button>
            </a-form-item>
            <template v-else>
              <Manual v-if="data.triggerType === 'manual'" :show-actions="false" />
              <DetailedTimerTrigger v-else-if="data.triggerType === 'timer'" ref="timerTriggerRef" />
              <Device v-else-if="data.triggerType === 'device'" ref="deviceRef" :show-terms="false" :show-title="false" />
              <Collector v-else-if="data.triggerType === 'collector'" ref="collectorRef" :show-terms="false" :show-title="false" />
              <DetailedMultiTriggerConfig v-else-if="data.triggerType === 'multi'" ref="multiTriggerRef" v-model="data.trigger" :trigger-options="multiTriggerOptions" :collapse-to-single="lockedTriggerRoot !== 'multi'" @collapse="restoreSingleTrigger" />
              <SaasTriggerConfig ref="saasTriggerRef" v-else-if="['alarm', 'ai-event'].includes(data.triggerType)" />
              <section v-else-if="data.triggerType" class="detailed-scene-editor__provider-placeholder">
                <a-empty :description="$t('IotSceneLinkage.message.detailProviderPending', { provider: data.triggerType })" />
              </section>
              <div v-if="showTriggerRuleActions" class="detailed-scene-editor__trigger-rule-actions">
                <a-tooltip v-if="canEditTrigger" :title="$t('IotSceneLinkage.action.edit')">
                  <a-button type="text" @click="editCurrentTrigger"><AIcon type="EditOutlined" /></a-button>
                </a-tooltip>
                <a-tooltip v-if="canRemoveTrigger" :title="$t('IotSceneLinkage.action.delete')">
                  <a-button type="text" danger @click="removeTrigger"><AIcon type="DeleteOutlined" /></a-button>
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
        <header class="detailed-scene-editor__section-header">
          <span class="detailed-scene-editor__section-icon"><AIcon type="PlayCircleOutlined" /></span>
          <div><h2>{{ $t('IotSceneLinkage.detail.executionRule') }}</h2><p>{{ $t('IotSceneLinkage.detail.executionRuleHint') }}</p></div>
        </header>
        <div class="detailed-scene-editor__section-body">
          <div class="detailed-scene-editor__configuration-panel">
            <DetailedSceneExecution :rule="data" :trigger-type="data.triggerType" />
          </div>
        </div>
      </section>
    </a-form>
    <!-- 内容面板使用 backdrop-filter，会改变 fixed 子元素的定位参照；操作栏挂到 body 才能始终相对视口固定。 -->
    <Teleport to="body">
      <footer class="detailed-scene-editor__footer">
        <a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
        <j-permission-button type="primary" :hasPermission="savePermission" :loading="saving" @click="save">{{ $t('IotSceneLinkage.action.saveScene') }}</j-permission-button>
      </footer>
    </Teleport>
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
import { computed, nextTick, onMounted, provide, ref, watch, type PropType } from 'vue'
import { cloneDeep } from 'lodash-es'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { PageHeader } from '@jetlinks-web-core/components'
import { useI18n } from 'vue-i18n'
import { querySceneSupportedActions, type SceneProviderInfo } from '../../../../api/scene-linkage'
import { getParseTerm } from '../../../../api/scene'
import Manual from '../../../Scene/Save/Manual/index.vue'
import Device from '../../../Scene/Save/Device/index.vue'
import Collector from '../../../Scene/Save/Collector/index.vue'
import SaasTriggerConfig from './SaasTriggerConfig.vue'
import DetailedMultiTriggerConfig from './DetailedMultiTriggerConfig.vue'
import DetailedSceneRuleSummary from './DetailedSceneRuleSummary.vue'
import DetailedSceneExecution from './DetailedSceneExecution.vue'
import DetailedTimerTrigger from './DetailedTimerTrigger.vue'
import RulePreviewCard from '../components/RulePreviewCard.vue'
import TriggerPickerModal, { type TriggerPickerOption } from '../components/TriggerPickerModal.vue'
import { MULTI_TRIGGER_PROVIDERS, normalizeResult } from '../../utils'
import { type SceneEditorMode, type SceneRuleRecord } from '../editorMode'
import { useDetailedSceneDraft } from './useDetailedSceneDraft'
const props = defineProps({
  rule: {
    type: Object as PropType<SceneRuleRecord>,
    required: true,
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
  save: [rule: SceneRuleRecord]
  'switch-mode': [mode: SceneEditorMode, draft: SceneRuleRecord]
}>()
const { t } = useI18n()
const sceneForm = ref()
const deviceRef = ref()
const timerTriggerRef = ref<{ openConfig: () => void }>()
const collectorRef = ref<{ openConfig: () => void }>()
const multiTriggerRef = ref<{ validate: () => string | undefined; openPicker: () => void }>()
const saasTriggerRef = ref<{ validate: () => string | undefined }>()
const actionOptions = ref<SceneProviderInfo[]>([])
const termColumns = ref<Record<string, string>>({})
const readOnlyActionProviders = ref(['alarm', 'notify'])
const triggerPickerVisible = ref(false)
const { data, load, getDraft } = useDetailedSceneDraft()
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
/**
 * 顶层触发器名称和说明由后端 Provider 按当前语言环境返回，
 * 前端只保留 Provider 值作为异常数据的最小展示兜底。
 */
function toTriggerPickerOption(item: SceneProviderInfo): TriggerPickerOption {
  return {
    value: item.provider,
    provider: item.provider,
    icon: triggerIcons[item.provider] || 'ThunderboltOutlined',
    // 触发器名称及描述以 Provider 返回的国际化结果为准，前端仅为异常旧数据保留类型值兜底。
    label: item.name || item.provider,
    description: item.description || '',
  }
}
const triggerOptions = computed<TriggerPickerOption[]>(() => props.triggerProviders
  // 多条件由“添加触发规则”自动升级，不作为独立的首次触发方式入口。
  .filter(item => item.provider !== 'multi' && props.supportedTriggers.includes(item.provider))
  .map(item => ({
    ...toTriggerPickerOption(item),
    disabled: Boolean(props.lockedTriggerProviders.length && !props.lockedTriggerProviders.includes(item.provider)),
    disabledReason: 'IotSceneLinkage.message.triggerProviderLocked',
  })))
// 与后端 MultiTrigger 的固定叶子限制保持一致，避免选择后才在保存时失败。
const multiTriggerOptions = computed<TriggerPickerOption[]>(() => {
  const triggerKinds = [
    { value: 'repeat', icon: 'ClockCircleOutlined', provider: 'timer' },
    { value: 'date', icon: 'CalendarOutlined', provider: 'timer' },
    { value: 'interval', icon: 'SyncOutlined', provider: 'timer' },
    { value: 'property', icon: 'RiseOutlined', provider: 'device' },
    { value: 'event', icon: 'NotificationOutlined', provider: 'device' },
    { value: 'online', icon: 'LoginOutlined', provider: 'device' },
    { value: 'offline', icon: 'LogoutOutlined', provider: 'device' },
    { value: 'state', icon: 'SyncOutlined', provider: 'device' },
    { value: 'alarm', icon: 'AlertOutlined', provider: 'alarm' },
  ]
  return triggerKinds
    .filter(item => MULTI_TRIGGER_PROVIDERS.includes(item.provider as typeof MULTI_TRIGGER_PROVIDERS[number]))
    .filter(item => props.supportedTriggers.includes(item.provider))
    .map(item => {
      const provider = props.triggerProviders.find(providerItem => providerItem.provider === item.provider)
      return {
        ...item,
        label: t(`IotSceneLinkage.trigger.${item.value}`),
        description: t(`IotSceneLinkage.triggerDesc.${item.value}`),
        providerLabel: provider?.name || item.provider,
        providerDescription: provider?.description || '',
        disabled: Boolean(props.lockedTriggerProviders.length && !props.lockedTriggerProviders.includes(item.provider)),
        disabledReason: 'IotSceneLinkage.message.triggerProviderLocked',
      }
    })
})
const canConvertToMulti = computed(() => data.value.triggerType !== 'multi'
  && MULTI_TRIGGER_PROVIDERS.includes(String(data.value.triggerType) as typeof MULTI_TRIGGER_PROVIDERS[number])
  && props.supportedTriggers.includes('multi'))
const canEditTrigger = computed(() => ['device', 'timer', 'collector'].includes(String(data.value.triggerType)))
const canRemoveTrigger = computed(() => Boolean(data.value.triggerType) && data.value.triggerType !== 'multi')
const showTriggerRuleActions = computed(() => canEditTrigger.value || canRemoveTrigger.value)
/** 原版触发组件通过 trigger.type 和 triggerType 同时读取触发器类型。 */
function changeTrigger(triggerType: string) {
  data.value.triggerType = triggerType
  data.value.trigger = triggerType === 'multi'
    ? { type: 'multi', multi: { triggers: [] } }
    : { type: triggerType }
}

async function selectTriggerFromPicker(triggerType: string) {
  triggerPickerVisible.value = false
  // 编辑场景删除后仍可重选，但不能通过选择器回调绕过已保存 Provider 的限制。
  if (props.lockedTriggerProviders.length && !props.lockedTriggerProviders.includes(triggerType)) return
  // 重选当前触发方式不能清空已经填写的原版触发器配置。
  if (data.value.triggerType === triggerType) return
  changeTrigger(triggerType)
  // 选择后直接进入对应配置，避免把“选择类型”和“填写规则”拆成两步。
  await nextTick()
  if (triggerType === 'device') deviceRef.value?.openConfig()
  else if (triggerType === 'timer') timerTriggerRef.value?.openConfig()
  else if (triggerType === 'collector') collectorRef.value?.openConfig()
}

/** 与快速模式保持一致：已选规则提供显式编辑入口，但已保存规则不允许更换类型。 */
function editCurrentTrigger() {
  if (data.value.triggerType === 'device') deviceRef.value?.openConfig()
  else if (data.value.triggerType === 'timer') timerTriggerRef.value?.openConfig()
  else if (data.value.triggerType === 'collector') collectorRef.value?.openConfig()
}

/** 已保存场景也允许删除后重配；Provider 锁独立于草稿，因此不会被这一步清空。 */
function removeTrigger() {
  data.value.triggerType = ''
  data.value.trigger = {}
  sceneForm.value?.clearValidate?.('triggerType')
}

/** 多条件删除至一条时回到普通触发器，避免把单条规则误展示为组合规则。 */
function restoreSingleTrigger(value: { triggerType: string; trigger: Record<string, any> }) {
  data.value.triggerType = value.triggerType
  data.value.trigger = value.trigger
}

/**
 * 后端的 multi 仅接受设备、定时和告警叶子。转换时保留原始触发器节点，
 * 只替换触发根节点，不触碰详细分支、条件和执行动作。
 */
async function convertTriggerToMulti() {
  const trigger = cloneDeep(data.value.trigger || { type: data.value.triggerType })
  data.value.triggerType = 'multi'
  data.value.trigger = { type: 'multi', multi: { triggers: [{ index: 1, trigger, terms: [] }] } }
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

/** 将后端解析的上下文字段树压平为预览可用名称，避免把 properties.xxx 这类内部路径直接展示给用户。 */
function toTermColumnMap(columns: any[]): Record<string, string> {
  return columns.reduce((result, item) => {
    if (item?.column) result[item.column] = item.fullName || item.name || item.label || item.column
    return { ...result, ...toTermColumnMap(item?.children || []) }
  }, {} as Record<string, string>)
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

  const branches = (Array.isArray(draft.branches) ? draft.branches : []).flatMap((item): SceneRuleRecord[] => {
    const branch = asRuleRecord(item)
    const when = normalizeParseConditions(branch.when)
    return when.length ? [{ ...branch, when }] : []
  })
  if (!branches.length) return undefined

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
    const response = await getParseTerm(draft)
    if (requestId === latestTermColumnsRequest) termColumns.value = toTermColumnMap(response?.result || [])
  } catch {
    // 字段解析失败时仍保留已存展示名称或字段路径，不能阻断详细规则编辑。
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
async function save() {
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
  emit('save', getDraft())
}

function switchToQuick() {
  emit('switch-mode', 'quick', getDraft())
}

watch(() => props.rule, load, { immediate: true, deep: true })
// 字段名称只依赖触发器与条件树；不要监听完整草稿，以免名称、说明等编辑触发无关请求。
watch(() => ({ trigger: data.value.trigger, branches: data.value.branches }), loadTermColumns, { deep: true, immediate: true })
onMounted(() => void loadActionOptions())
</script>
