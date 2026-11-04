<template>
  <a-modal
    :open="open"
    :footer="null"
    :width="680"
    :mask-closable="false"
    wrap-class-name="trigger-picker-modal"
    @cancel="close"
  >
    <template #title>
      <div class="trigger-picker__title">
        <span>{{ title || $t('IotSceneLinkage.title.triggerPicker') }}</span>
        <small>{{ hint || $t('IotSceneLinkage.editor.triggerPickerHint') }}</small>
      </div>
    </template>
    <div class="trigger-picker__body">
      <div v-if="selectedCategory" class="trigger-picker__subtype-panel">
        <button type="button" class="trigger-picker__back" @click="selectedProvider = ''">
          <AIcon type="LeftOutlined" />{{ selectedCategory.label }}
        </button>
        <div class="trigger-picker__grid">
          <a-tooltip v-for="item in selectedCategory.items" :key="item.value" :title="item.disabled ? $t(item.disabledReason || '') : undefined">
            <button class="trigger-picker__card" type="button" :disabled="item.disabled" @click="select(item.value)">
              <span class="trigger-picker__icon"><AIcon :type="item.icon" /></span>
              <span class="trigger-picker__card-content"><b>{{ item.label }}</b><small>{{ item.description }}</small></span>
              <AIcon class="trigger-picker__arrow" type="RightOutlined" />
            </button>
          </a-tooltip>
        </div>
      </div>
      <div v-else class="trigger-picker__grid">
        <a-tooltip v-for="category in categories" :key="category.provider" :title="category.disabled ? $t(category.disabledReason) : undefined">
          <button type="button" class="trigger-picker__card" :disabled="category.disabled" @click="selectCategory(category.provider)">
            <span class="trigger-picker__icon"><AIcon :type="category.icon" /></span>
            <span class="trigger-picker__card-content"><b>{{ category.label }}</b><small>{{ category.description }}</small></span>
            <AIcon class="trigger-picker__arrow" type="RightOutlined" />
          </button>
        </a-tooltip>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

export type TriggerPickerOption = {
  value: string
  provider: string
  icon: string
  label: string
  description: string
  /** 快速配置按用户可理解的触发方式分组，允许同一 Provider 拆成多个入口。 */
  category?: string
  categoryLabel?: string
  categoryDescription?: string
  /** Provider 分组标题由后端返回时，覆盖快速模式的本地分组文案。 */
  providerLabel?: string
  providerDescription?: string
  disabled?: boolean
  disabledReason?: string
}

type TriggerPickerMode = 'quick' | 'provider'

const props = defineProps<{
  open: boolean
  options: TriggerPickerOption[]
  mode?: TriggerPickerMode
  title?: string
  hint?: string
}>()

const emit = defineEmits<{
  cancel: []
  select: [value: string]
}>()

const { t } = useI18n()
const selectedProvider = ref('')
const providerIcons: Record<string, string> = {
  device: 'ApiOutlined',
  timer: 'ClockCircleOutlined',
  collector: 'DatabaseOutlined',
  alarm: 'AlertOutlined',
  'ai-event': 'RadarChartOutlined',
  manual: 'ThunderboltOutlined',
  multi: 'ClusterOutlined',
  'iot-alarm': 'AlertOutlined',
  'visual-alarm': 'EyeOutlined',
}
const providerOrder = ['device', 'timer', 'iot-alarm', 'visual-alarm', 'ai-event', 'manual', 'collector', 'alarm', 'multi']
const categories = computed(() => {
  if (props.mode === 'provider') {
    return props.options.map(item => ({
      provider: item.provider,
      icon: item.icon,
      label: item.label,
      description: item.description,
      canExpand: false,
      items: [item],
      disabled: Boolean(item.disabled),
      disabledReason: item.disabledReason || '',
    }))
  }

  const categoryId = (item: TriggerPickerOption) => item.category || item.provider
  const providers = [
    ...providerOrder.filter(provider => props.options.some(item => categoryId(item) === provider)),
    ...props.options
      .map(categoryId)
      .filter(provider => !providerOrder.includes(provider)),
  ]
  return [...new Set(providers)].map(provider => {
    const items = props.options.filter(item => categoryId(item) === provider)
    const providerInfo = items[0]
    return {
      provider,
      icon: providerIcons[provider] || 'ThunderboltOutlined',
      label: providerInfo?.categoryLabel || providerInfo?.providerLabel || t(`IotSceneLinkage.triggerType.${provider}`),
      description: providerInfo?.categoryDescription || providerInfo?.providerDescription || t(`IotSceneLinkage.triggerTypeDesc.${provider}`),
      canExpand: items.length > 1,
      items,
      disabled: items.every(item => item.disabled),
      disabledReason: items.find(item => item.disabled)?.disabledReason || '',
    }
  })
})
const selectedCategory = computed(() => categories.value.find(category => category.provider === selectedProvider.value))
function select(value: string) {
  if (props.options.find(item => item.value === value)?.disabled) return
  emit('select', value)
  selectedProvider.value = ''
}

function selectCategory(provider: string) {
  const category = categories.value.find(item => item.provider === provider)
  if (category?.disabled) return
  if (category?.canExpand) {
    selectedProvider.value = selectedProvider.value === provider ? '' : provider
    return
  }
  if (category?.items[0]) {
    select(category.items[0].value)
  }
}

function close() {
  selectedProvider.value = ''
  emit('cancel')
}
</script>

<style scoped>
:global(.trigger-picker-modal .ant-modal-content) {
  padding: 1rem;
  overflow: hidden;
  background: linear-gradient(180deg, #bad6ff 0%, #ebf3ff 10%, #fff 31%);
  border-radius: 1.25rem;
  box-shadow: none;
}

:global(.trigger-picker-modal .ant-modal-header) {
  margin-bottom: 0 !important;
}

:global(.trigger-picker-modal .ant-modal-title) {
  padding-bottom: var(--space-1, 4px) !important;
}

:global(.trigger-picker-modal .ant-modal-body) {
  padding: 0;
}

.trigger-picker__title {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: baseline;
  min-width: 0;
}

.trigger-picker__title span {
  flex: none;
}

.trigger-picker__title small {
  overflow: hidden;
  color: var(--ant-color-text-tertiary);
  font-size: .75rem;
  font-weight: 400;
  line-height: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-picker__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3, 12px);
}

.trigger-picker__body {
  padding: var(--space-2, 8px) .875rem .75rem;
  background: rgb(255 255 255 / 70%);
  border: 1px solid #eceff3;
  border-radius: 1rem;
}

.trigger-picker__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  color: #1e72f0;
  background: linear-gradient(180deg, #f6f9fe 0%, #fefefe 100%);
  border: 1px solid #f3f7fc;
  border-radius: 50%;
  transition: color .2s, background-color .2s, border-color .2s;
}

.trigger-picker__card {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
  min-height: 4.125rem;
  padding: .6875rem .9375rem;
  text-align: left;
  background: linear-gradient(123deg, #fff 0%, #f8fbff 100%);
  border: 1px solid #f1f5f9;
  border-radius: .5rem;
  cursor: pointer;
  transition: border-color .2s, background-color .2s;
}

.trigger-picker__card:hover:not(:disabled) {
  background: #e8f3ff;
  border-color: #1e72f0;
}

.trigger-picker__card:hover:not(:disabled) .trigger-picker__icon {
  color: #fff;
  background: #3b82f6;
  border-color: #3b82f6;
}

.trigger-picker__card:hover:not(:disabled) .trigger-picker__arrow {
  color: #1e72f0;
}

.trigger-picker__card:disabled { cursor: not-allowed; opacity: .55; }
.trigger-picker__card-content { display: grid; flex: 1; min-width: 0; gap: var(--space-1, 4px); }
.trigger-picker__card-content b { overflow: hidden; color: var(--jet-theme-text); font-size: .875rem; text-overflow: ellipsis; white-space: nowrap; }
.trigger-picker__card-content small { overflow: hidden; color: var(--ant-color-text-tertiary); font-size: .75rem; line-height: 1rem; text-overflow: ellipsis; white-space: nowrap; }
.trigger-picker__arrow { flex: none; color: var(--ant-color-text-tertiary); transition: color .2s; }
.trigger-picker__icon :deep(.anticon) { font-size: 1.25rem; }
.trigger-picker__subtype-panel { display: grid; gap: var(--space-3, 12px); }
.trigger-picker__back { display: inline-flex; gap: var(--space-1, 4px); align-items: center; width: fit-content; padding: 0; color: var(--ant-color-text-secondary); background: transparent; border: 0; cursor: pointer; }
.trigger-picker__back:hover { color: var(--ant-color-primary); }
@media (max-width: 640px) { .trigger-picker__grid { grid-template-columns: 1fr; } }
</style>
