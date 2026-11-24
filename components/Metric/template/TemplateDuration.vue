<template>
  <span class="template-duration" :class="{ 'is-empty':emptyLabel && !modelValue && !editing }" @focusin="editing = true" @focusout="leave">
  <a-input v-if="rawMode" :value="modelValue" :disabled="disabled" :bordered="false" :aria-label="t('durationAmount')" @update:value="setRaw" />
  <template v-else>
    <Editable class="template-duration__amount" type="number" :value="seconds === undefined ? undefined : seconds / unit" :component-props="{ min, disabled, placeholder:emptyLabel, controls:false, bordered:false, 'aria-label':t('durationAmount') }" @change="update($event as number | string | null)" />
    <Editable class="template-duration__unit" type="select" :value="unit" :component-props="{ disabled, bordered:false, showArrow:false, defaultOpen:true, dropdownMatchSelectWidth:false, 'aria-label':t('durationUnit'), options:units.map(item => ({ value:item.value, label:durationUnitText(item.label, amount, t), icon:'ClockCircleOutlined', description:t(`unit${item.label[0].toUpperCase()}${item.label.slice(1)}Hint`) })) }" @change="changeUnit($event as number)">{{ durationUnitText(units.find(item=>item.value === unit)?.label || 'seconds', amount, t) }}</Editable>
  </template>
  </span>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import { durationSeconds } from './window'
import { durationUnitText } from './durationPresentation'
const props = withDefaults(defineProps<{ modelValue?: string; disabled?: boolean; min?: number; emptyLabel?: string }>(), { min: 0 })
const emit = defineEmits<{ (event: 'update:modelValue', value: string | undefined): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const units = [{ value: 1, label: 'seconds' }, { value: 60, label: 'minutes' }, { value: 3600, label: 'hours' }, { value: 86400, label: 'days' }]
const seconds = computed(() => durationSeconds(props.modelValue))
const amount = computed(() => seconds.value === undefined ? undefined : seconds.value / unit.value)
const rawMode = ref(seconds.value === undefined && !!props.modelValue)
const editing = ref(false)
const unit = ref([...units].reverse().find(item => seconds.value && seconds.value % item.value === 0)?.value || 1)
function update(value: number | string | null) {
  if (!props.disabled) emit('update:modelValue', value == null || value === '' ? undefined : `PT${Number(value) * unit.value}S`)
}
function changeUnit(value: number) {
  if (props.disabled) return
  const amount = seconds.value === undefined ? undefined : seconds.value / unit.value
  unit.value = value
  if (amount !== undefined) update(amount)
}
function setRaw(value: string) { if (!props.disabled) emit('update:modelValue', value || undefined) }
function syncMode() {
  const nextRaw = seconds.value === undefined && !!props.modelValue
  if (rawMode.value && !nextRaw) unit.value = [...units].reverse().find(item => seconds.value && seconds.value % item.value === 0)?.value || 1
  rawMode.value = nextRaw
}
function leave(event: FocusEvent) {
  if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return
  editing.value = false
  syncMode()
}
// 自定义文本在输入期间保持原控件，清空和可解析的中间值都不触发重建。
watch(() => props.modelValue, () => { if (!editing.value) syncMode() })
</script>
<style scoped>
.template-duration { display:inline-flex; vertical-align:middle; align-items:center; gap:0; width:auto; height:32px; max-width:100%; flex:0 1 auto; color:var(--accent) }
.template-duration__amount { width:56px; min-width:0; flex:0 1 56px }
.template-duration__unit { width:auto; min-width:max-content; flex:none }
.template-duration.is-empty .template-duration__amount { width:auto; min-width:0; flex:none }
.template-duration.is-empty .template-duration__unit { display:none }
.template-duration :deep(.ant-input) { width:100% }
</style>
