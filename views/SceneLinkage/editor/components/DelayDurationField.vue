<template>
  <a-form-item :label="$t('IotSceneLinkage.detail.delayDuration')" :validate-status="invalid ? 'error' : undefined" :help="invalid ? $t('Delay.index.9667826-1') : undefined">
    <a-input-number class="scene-delay-duration" :value="time" :precision="0" :min="1" :max="65535" @change="changeTime">
      <template #addonAfter><a-select :value="unit" :options="units" @change="changeUnit" /></template>
    </a-input-number>
  </a-form-item>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ time?: number | null; unit: 'seconds' | 'minutes' | 'hours'; submitted?: boolean }>()
const emit = defineEmits<{ 'update:time': [value: number | null]; 'update:unit': [value: 'seconds' | 'minutes' | 'hours'] }>()
const { t: $t } = useI18n()
const invalid = computed(() => props.submitted && (props.time == null || !Number.isInteger(props.time) || props.time < 1 || props.time > 65535))
const units = computed(() => (['seconds', 'minutes', 'hours'] as const).map(value => ({ value, label: $t(`IotSceneLinkage.unit.${value}`) })))
function changeTime(value: unknown) { emit('update:time', typeof value === 'number' ? value : null) }
function changeUnit(value: unknown) {
  if (value === 'seconds' || value === 'minutes' || value === 'hours') emit('update:unit', value)
}
</script>

<style scoped>
.scene-delay-duration { width: 100%; max-width: 280px; }
.scene-delay-duration :deep(.ant-select) { min-width: 80px; text-align: left; }
</style>
