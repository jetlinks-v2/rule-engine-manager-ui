<template>
  <div class="thing-model-option">
    <span :class="['thing-model-option__icon', `thing-model-option__icon--${option.kind || 'property'}`]">
      <AIcon :type="iconType" />
    </span>
    <span class="thing-model-option__content">
      <a-tooltip :title="option.label">
        <span class="thing-model-option__title">{{ option.label }}</span>
      </a-tooltip>
      <a-tooltip v-if="description" :title="description" placement="right" :overlayStyle="{ pointerEvents: 'none' }">
        <span class="thing-model-option__description">{{ description }}</span>
      </a-tooltip>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ThingModelOption } from '../thingModel'

const props = defineProps({
  option: {
    type: Object as PropType<ThingModelOption>,
    required: true,
  },
})

const { t } = useI18n()
const iconType = computed(() => {
  if (props.option.kind === 'event') return 'NotificationOutlined'
  if (props.option.kind === 'function') return 'ApiOutlined'
  const type = String(props.option.valueType?.type || 'string').toLowerCase()
  if (['int', 'long', 'float', 'double', 'number'].includes(type)) return 'FundOutlined'
  if (['boolean', 'bool'].includes(type)) return 'CheckCircleOutlined'
  if (['date', 'datetime'].includes(type)) return 'ClockCircleOutlined'
  if (type === 'enum') return 'TagsOutlined'
  if (type === 'string') return 'ReadOutlined'
  return 'BarChartOutlined'
})
const description = computed(() => {
  if (!props.option.value) return ''
  if (props.option.kind === 'function') {
    const parameters = t('IotSceneLinkage.thingModel.functionParameters', {
      input: props.option.inputCount || 0,
      output: props.option.outputCount || 0,
    })
    return `${props.option.value} ${parameters}`
  }
  if (props.option.kind === 'event') {
    const outputs = t('IotSceneLinkage.thingModel.eventOutputs', { count: props.option.outputCount || 0 })
    return `${props.option.value} ${outputs}`
  }
  const type = t(`IotSceneLinkage.thingModel.type.${props.option.valueType?.type || 'string'}`)
  return [
    props.option.value,
    type,
    props.option.unit,
  ].filter(Boolean).join(' · ')
})
</script>

<style scoped>
.thing-model-option { display: flex; gap: var(--space-2, 8px); align-items: center; min-width: 0; padding: var(--space-1, 4px) 0; }
.thing-model-option__icon { display: grid; flex: none; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-jet-sm, 8px); }
.thing-model-option__icon--property { color: #0e8a5f; background: #e6f5ee; }
.thing-model-option__icon--event { color: #d02f5a; background: #ffecf0; }
.thing-model-option__icon--function { color: #6c4fe0; background: #efebff; }
.thing-model-option__content { display: grid; flex: 1; gap: 6px; min-width: 0; line-height: 1.35; }
.thing-model-option__title { overflow: hidden; color: var(--ant-color-text); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.thing-model-option__description { display: -webkit-box; box-sizing: border-box; width: 100%; overflow: hidden; color: var(--ant-color-text-tertiary, #86909c) !important; font-size: 12px; font-weight: 400 !important; line-height: 18px; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
</style>
