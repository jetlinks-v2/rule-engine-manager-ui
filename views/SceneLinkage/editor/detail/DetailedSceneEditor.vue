<template>
  <main class="detailed-scene-editor">
    <PageHeader show-back :title="rule.id ? $t('IotSceneLinkage.title.editRule') : $t('IotSceneLinkage.title.addRule')">
      <template #description>
        <DetailedSceneRuleSummary
          :rule="data"
          :trigger-providers="triggerProviders"
          :action-providers="actionOptions"
          @change="updateSummary"
          @title-change="updateSummaryTitle"
        />
      </template>
      <template #actions>
        <a-space>
          <a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
          <j-permission-button type="primary" :hasPermission="savePermission" :loading="saving" @click="save">
            {{ $t('IotSceneLinkage.action.saveScene') }}
          </j-permission-button>
        </a-space>
      </template>
    </PageHeader>

    <section class="detailed-scene-editor__mode">
      <span>{{ $t('IotSceneLinkage.editor.mode') }}</span>
      <a-radio-group :value="'detail'" button-style="solid" @change="switchToQuick">
        <a-radio-button value="quick">{{ $t('IotSceneLinkage.editor.quickMode') }}</a-radio-button>
        <a-radio-button value="detail">{{ $t('IotSceneLinkage.editor.detailMode') }}</a-radio-button>
      </a-radio-group>
    </section>

    <a-form ref="sceneForm" :model="data" :colon="false" layout="vertical" class="detailed-scene-editor__form">
      <a-form-item :label="$t('IotSceneLinkage.form.sceneName')" name="name" :rules="nameRules">
        <a-input v-model:value="data.name" :placeholder="$t('IotSceneLinkage.placeholder.editorName')" />
      </a-form-item>

      <a-form-item :label="$t('IotSceneLinkage.form.triggerType')" name="triggerType" :rules="triggerRules">
        <a-button
          v-if="!data.triggerType"
          block
          class="detailed-scene-editor__trigger-add"
          @click="triggerPickerVisible = true"
        >
          <AIcon type="PlusOutlined" />
          {{ $t('IotSceneLinkage.action.addTrigger') }}
        </a-button>
        <a-button v-else block class="detailed-scene-editor__trigger-picker" @click="triggerPickerVisible = true">
          <span class="detailed-scene-editor__trigger-picker-icon">
            <AIcon :type="selectedTrigger?.icon || 'ThunderboltOutlined'" />
          </span>
          <span class="detailed-scene-editor__trigger-picker-content">
            <b>{{ selectedTrigger?.label || data.triggerType }}</b>
            <small>{{ selectedTrigger?.description }}</small>
          </span>
          <AIcon type="RightOutlined" />
        </a-button>
      </a-form-item>

      <Manual v-if="data.triggerType === 'manual'" />
      <Timer v-else-if="data.triggerType === 'timer'" />
      <Device v-else-if="data.triggerType === 'device'" ref="deviceRef" />
      <Collector v-else-if="data.triggerType === 'collector'" />
      <DetailedMultiTriggerConfig
        v-else-if="data.triggerType === 'multi'"
        ref="multiTriggerRef"
        v-model="data.trigger"
        :trigger-options="multiTriggerOptions"
      />
      <SaasTriggerConfig ref="saasTriggerRef" v-else-if="['alarm', 'ai-event'].includes(data.triggerType)" />
      <!-- SaaS 触发器只补充触发源，详细条件和动作仍复用原版规则树编辑器。 -->
      <Terms v-if="['alarm', 'ai-event'].includes(data.triggerType)" />
      <section v-else-if="data.triggerType" class="detailed-scene-editor__provider-placeholder">
        <a-empty :description="$t('IotSceneLinkage.message.detailProviderPending', { provider: data.triggerType })" />
      </section>
    </a-form>

    <TriggerPickerModal
      :open="triggerPickerVisible"
      mode="provider"
      :title="$t('IotSceneLinkage.form.triggerType')"
      :hint="$t('IotSceneLinkage.editor.triggerPickerHint')"
      :options="triggerOptions"
      @cancel="triggerPickerVisible = false"
      @select="selectTriggerFromPicker"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref, watch, type PropType } from 'vue'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { PageHeader } from '@jetlinks-web-core/components'
import { useI18n } from 'vue-i18n'
import { querySceneSupportedActions, type SceneProviderInfo } from '../../../../api/scene-linkage'
import Manual from '../../../Scene/Save/Manual/index.vue'
import Timer from '../../../Scene/Save/Timer/index.vue'
import Device from '../../../Scene/Save/Device/index.vue'
import Collector from '../../../Scene/Save/Collector/index.vue'
import Terms from '../../../Scene/Save/components/Terms/Terms.vue'
import SaasTriggerConfig from './SaasTriggerConfig.vue'
import DetailedMultiTriggerConfig from './DetailedMultiTriggerConfig.vue'
import DetailedSceneRuleSummary from './DetailedSceneRuleSummary.vue'
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
const multiTriggerRef = ref<{ validate: () => string | undefined }>()
const saasTriggerRef = ref<{ validate: () => string | undefined }>()
const actionOptions = ref<SceneProviderInfo[]>([])
const readOnlyActionProviders = ref(['alarm', 'notify'])
const triggerPickerVisible = ref(false)
const { data, load, getDraft } = useDetailedSceneDraft()
const nameRules = [{ required: true, message: t('IotSceneLinkage.message.nameRequired') }]
const triggerRules = [{ required: true, message: t('IotSceneLinkage.message.triggerRequired') }]

provide('action-options', actionOptions)
provide('readonly-action-providers', readOnlyActionProviders)

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
  .filter(item => props.supportedTriggers.includes(item.provider))
  .map(toTriggerPickerOption))
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
      }
    })
})
const selectedTrigger = computed(() => triggerOptions.value.find(item => item.value === data.value.triggerType))

/** 原版触发组件通过 trigger.type 和 triggerType 同时读取触发器类型。 */
function changeTrigger(triggerType: string) {
  data.value.triggerType = triggerType
  data.value.trigger = triggerType === 'multi'
    ? { type: 'multi', multi: { triggers: [] } }
    : { type: triggerType }
}

function selectTriggerFromPicker(triggerType: string) {
  triggerPickerVisible.value = false
  // 重选当前触发方式不能清空已经填写的原版触发器配置。
  if (data.value.triggerType === triggerType) return
  changeTrigger(triggerType)
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
onMounted(() => void loadActionOptions())
</script>

<style scoped>
.detailed-scene-editor { display: flex; flex-direction: column; gap: var(--space-4, 16px); }
.detailed-scene-editor__mode { display: flex; align-items: center; gap: var(--space-3, 12px); }
.detailed-scene-editor__mode > span { color: var(--ant-color-text-secondary); }
.detailed-scene-editor__form { max-width: 1200px; padding: var(--space-5, 20px); background: var(--ant-color-bg-container); border: 1px solid var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 10px); }
.detailed-scene-editor__provider-placeholder { padding: var(--space-6, 24px); border: 1px dashed var(--ant-color-border); border-radius: var(--radius-jet-sm, 10px); }
.detailed-scene-editor__trigger-add { height: 2.5rem; color: var(--ant-color-primary); border-color: var(--ant-color-primary); }
.detailed-scene-editor__trigger-picker { display: flex; align-items: center; height: auto; min-height: 4.125rem; padding: var(--space-3, 12px) var(--space-4, 16px); text-align: left; background: linear-gradient(123deg, var(--jet-theme-bg-container) 0%, var(--jet-theme-border-secondary) 100%); border-color: var(--ant-color-border-secondary); }
.detailed-scene-editor__trigger-picker:hover { border-color: var(--ant-color-primary); }
.detailed-scene-editor__trigger-picker-icon { display: grid; flex: none; place-items: center; width: 2.5rem; height: 2.5rem; margin-right: var(--space-3, 12px); color: var(--ant-color-primary); background: linear-gradient(180deg, #f6f9fe 0%, #fefefe 100%); border: 1px solid #f3f7fc; border-radius: 50%; }
.detailed-scene-editor__trigger-picker-icon :deep(.anticon) { font-size: 1.25rem; }
.detailed-scene-editor__trigger-picker-content { display: grid; flex: 1; gap: var(--space-1, 4px); min-width: 0; }
.detailed-scene-editor__trigger-picker-content b { overflow: hidden; color: var(--ant-color-text); text-overflow: ellipsis; white-space: nowrap; }
.detailed-scene-editor__trigger-picker-content small { overflow: hidden; color: var(--ant-color-text-tertiary); font-size: .75rem; text-overflow: ellipsis; white-space: nowrap; }
</style>
