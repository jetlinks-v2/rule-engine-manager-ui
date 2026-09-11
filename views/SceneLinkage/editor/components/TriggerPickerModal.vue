<template>
  <a-modal
    :open="open"
    :footer="null"
    :width="520"
    :mask-closable="false"
    wrap-class-name="trigger-picker-modal"
    @cancel="close"
  >
    <template #title>
      <div class="trigger-picker__title">
        <span>{{ $t('IotSceneLinkage.title.triggerPicker') }}</span>
        <small>{{ $t('IotSceneLinkage.editor.triggerPickerHint') }}</small>
      </div>
    </template>
    <div :class="['trigger-picker__body', { 'trigger-picker__body--expanded': selectedProvider }]">
      <div class="trigger-picker__categories">
        <div
          v-for="category in categories"
          :key="category.provider"
          :class="['trigger-picker__category-group', { 'trigger-picker__category-group--expanded': selectedProvider === category.provider }]"
        >
        <button
          type="button"
          :class="['trigger-picker__category', { 'trigger-picker__category--expanded': selectedProvider === category.provider }]"
          @click="selectCategory(category.provider)"
        >
          <span class="trigger-picker__icon" :style="providerIconStyle(category.provider)"><AIcon :type="category.icon" /></span>
          <span class="trigger-picker__category-content">
            <b>{{ category.label }}</b>
            <small>{{ category.description }}</small>
          </span>
          <AIcon
            v-if="category.canExpand"
            class="trigger-picker__expand-icon"
            :type="selectedProvider === category.provider ? 'UpOutlined' : 'DownOutlined'"
          />
        </button>
        <div v-if="selectedProvider === category.provider" class="trigger-picker__subtypes">
          <div class="trigger-picker__subtypes-list">
            <a-tooltip v-for="item in category.items" :key="item.value" :title="item.disabled ? $t(item.disabledReason) : undefined">
              <span class="trigger-picker__item-wrapper">
                <button class="trigger-picker__item" type="button" :disabled="item.disabled" @click="select(item.value)">
                  <span class="trigger-picker__icon" :style="triggerIconStyle(item.value)"><AIcon :type="item.icon" /></span>
                  <span><b>{{ item.label }}</b><small>{{ item.description }}</small></span>
                </button>
              </span>
            </a-tooltip>
          </div>
        </div>
      </div>
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
  disabled?: boolean
  disabledReason?: string
}

const props = defineProps<{
  open: boolean
  options: TriggerPickerOption[]
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
  alarm: 'AlertOutlined',
  'ai-event': 'RadarChartOutlined',
  manual: 'ThunderboltOutlined',
}
const providerIconStyles: Record<string, Record<string, string>> = {
  device: { color: '#1e72f0' },
  timer: { color: '#1e72f0' },
  alarm: { color: '#1e72f0' },
  'ai-event': { color: '#1e72f0' },
  manual: { color: '#1e72f0' },
}

const triggerIconStyles: Record<string, Record<string, string>> = {
    manual: providerIconStyles.manual,
    repeat: providerIconStyles.timer,
    date: { color: '#0e8a5f', background: '#e6f5ee' },
    interval: { color: '#6c4fe0', background: '#efebff' },
    property: { color: '#1e5eff', background: '#e8f0ff' },
    event: { color: '#d02f5a', background: '#ffecf0' },
    online: providerIconStyles.device,
    offline: providerIconStyles.manual,
    state: { color: '#6c4fe0', background: '#efebff' },
    alarm: providerIconStyles.alarm,
    'ai-event': { color: '#6c4fe0', background: '#efebff' },
}
const providerOrder = ['device', 'timer', 'alarm', 'ai-event', 'manual']
const categories = computed(() => providerOrder
  .map(provider => ({
    provider,
    icon: providerIcons[provider],
    label: t(`IotSceneLinkage.triggerType.${provider}`),
    description: t(`IotSceneLinkage.triggerTypeDesc.${provider}`),
    canExpand: ['device', 'timer'].includes(provider),
    items: props.options.filter(item => item.provider === provider),
    disabled: props.options.filter(item => item.provider === provider).every(item => item.disabled),
    disabledReason: props.options.filter(item => item.provider === provider).find(item => item.disabled)?.disabledReason || '',
  }))
  .filter(category => category.items.length))
function select(value: string) {
  if (props.options.find(item => item.value === value)?.disabled) return
  emit('select', value)
  selectedProvider.value = ''
}

function providerIconStyle(provider: string) {
  return providerIconStyles[provider] || providerIconStyles.manual
}

function triggerIconStyle(type: string) {
	return triggerIconStyles[type] || providerIconStyles.manual
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
:global(.trigger-picker-modal .ant-modal-header) {
  margin-bottom: 0 !important;
}

:global(.trigger-picker-modal .ant-modal-title) {
  padding-bottom: var(--space-1, 4px) !important;
}

:global(.trigger-picker-modal .ant-modal-body) {
  padding-top: 0;
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

.trigger-picker__header {
  display: flex;
  gap: 1.25rem;
  align-items: center;
  height: 1.375rem;
  margin-bottom: 1rem;
}

.trigger-picker__header strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #1d2129;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.375rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-picker__close {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.25rem;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  color: #4e5969;
}

.trigger-picker__close :deep(.anticon) {
  font-size: 1.25rem;
}

.trigger-picker__body {
  height: 24rem;
  padding: var(--space-2, 8px) .875rem .75rem;
  overflow: auto;
  background: var(--jet-theme-bg-container);
  border: 1px solid var(--jet-theme-border-secondary);
  border-radius: 1rem;
  margin-top: 0;
}

.trigger-picker__body--expanded {
  height: 26rem;
}

.trigger-picker__categories,
.trigger-picker__subtypes-list {
  display: grid;
  gap: .5rem;
}

.trigger-picker__category-group {
  display: block;
}

.trigger-picker__category,
.trigger-picker__item {
  display: flex;
  gap: .375rem;
  align-items: center;
  width: 100%;
  text-align: left;
  cursor: pointer;
}

.trigger-picker__category {
  min-height: 4.125rem;
  padding: .6875rem .9375rem;
  background: linear-gradient(123deg, var(--jet-theme-bg-container) 0%, var(--jet-theme-border-secondary) 100%);
  border: 1px solid #f1f5f9;
  border-radius: .5rem;
  transition: border-color .2s, background-color .2s;
}

.trigger-picker__category:hover {
  border-color: #1e72f0;
}

.trigger-picker__category:focus,
.trigger-picker__item:focus {
  outline: 0;
}

.trigger-picker__category-group--expanded {
  padding: .75rem 1rem;
  background: linear-gradient(97deg, var(--jet-theme-bg-container) 0%, var(--jet-theme-border-secondary) 100%);
  border: 1px solid #1e72f0;
  border-radius: .5rem;
}

.trigger-picker__category--expanded {
  min-height: 2.5rem;
  padding: 0;
  background: transparent;
  border: 0;
}

.trigger-picker__category b {
	color: var(--jet-theme-text);
  font-size: .875rem;
  font-weight: 500;
  line-height: 1.25rem;
}

.trigger-picker__category small,
.trigger-picker__item small {
  overflow: hidden;
  color: #4e5969;
  font-size: .75rem;
  font-weight: 400;
  line-height: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-picker__expand-icon {
  flex: none;
  color: #4e5969;
  font-size: 1rem;
}

.trigger-picker__category-group--expanded .trigger-picker__expand-icon {
  color: #1e72f0;
}

.trigger-picker__subtypes {
  margin-top: .5rem;
}

.trigger-picker__item {
  min-height: 3.625rem;
  padding: .4375rem .6875rem;
  background: var(--jet-theme-bg-container);
  border: 1px solid #e9f0f8;
  border-radius: .375rem;
}

.trigger-picker__item b {
  color: var(--jet-theme-text);
  font-size: .8125rem;
  font-weight: 500;
  line-height: 1rem;
}

.trigger-picker__item:hover {
  border-color: #1e72f0;
}

.trigger-picker__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  background: linear-gradient(180deg, #f6f9fe 0%, #fefefe 100%) !important;
  border: 1px solid #f3f7fc;
  border-radius: 50%;
}

.trigger-picker__category-content {
	display: grid;
	flex: 1;
	gap: var(--space-1, 4px);
}

.trigger-picker__icon :deep(.anticon) {
  font-size: 1.25rem;
}
</style>
