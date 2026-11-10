<template>
  <div class="effective-period-select">
    <a-select :value="selectedPeriod" :options="options" @change="changePeriod" />
    <a-modal v-model:open="customVisible" :title="$t('IotSceneLinkage.effectivePeriod.custom')" :mask-closable="false" @ok="saveCustomRange">
      <a-form layout="vertical"><a-form-item :label="$t('IotSceneLinkage.condition.timeRange')"><a-time-range-picker v-model:value="customRange" format="HH:mm" value-format="HH:mm" /></a-form-item></a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatSceneTimeRange, type SceneTimeRange } from '../../utils'

type EffectivePeriod = 'all' | 'workday' | 'evening' | 'custom'
const props = defineProps({ modelValue: { type: Array as PropType<SceneTimeRange[]>, required: true } })
const emit = defineEmits<{ (event: 'update:modelValue', value: SceneTimeRange[]): void }>()
const { t } = useI18n()
const customVisible = ref(false)
const customRange = ref<string[]>(['09:00', '18:00'])
const periodRanges: Record<Exclude<EffectivePeriod, 'custom'>, SceneTimeRange[]> = {
  all: [], workday: [{ start: '09:00', end: '18:00' }], evening: [{ start: '20:00', end: '08:00' }],
}
const options = computed(() => [
  { value: 'all', label: t('IotSceneLinkage.effectivePeriod.all') },
  { value: 'workday', label: formatSceneTimeRange(t, periodRanges.workday[0]) },
  { value: 'evening', label: formatSceneTimeRange(t, periodRanges.evening[0]) },
  { value: 'custom', label: t('IotSceneLinkage.effectivePeriod.custom') },
])
const selectedPeriod = ref<EffectivePeriod>(findPeriod(props.modelValue))

/** 自定义时段单独以弹层编辑，避免下拉选中后配置控件被侧栏裁切或忽略。 */
function changePeriod(value: unknown) {
  if (value !== 'all' && value !== 'workday' && value !== 'evening' && value !== 'custom') return
  if (value === 'custom') {
    const range = props.modelValue[0] || { start: '09:00', end: '18:00' }
    customRange.value = [range.start, range.end]
    customVisible.value = true
    return
  }
  selectedPeriod.value = value
  emit('update:modelValue', periodRanges[value].map(range => ({ ...range })))
}
function saveCustomRange() {
  if (customRange.value.length !== 2 || !customRange.value.every(Boolean) || customRange.value[0] === customRange.value[1]) return
  selectedPeriod.value = 'custom'
  emit('update:modelValue', [{ start: customRange.value[0], end: customRange.value[1] }])
  customVisible.value = false
}
function findPeriod(ranges: SceneTimeRange[]): EffectivePeriod {
  return (Object.keys(periodRanges) as Array<Exclude<EffectivePeriod, 'custom'>>)
    .find(period => hasSameRanges(ranges, periodRanges[period])) || 'custom'
}
function hasSameRanges(left: SceneTimeRange[], right: SceneTimeRange[]) { return left.length === right.length && left.every((range, index) => range.start === right[index]?.start && range.end === right[index]?.end) }
watch(() => props.modelValue, ranges => { selectedPeriod.value = findPeriod(ranges) }, { deep: true })
</script>

<style scoped>
.effective-period-select { width: 100%; }
.effective-period-select :deep(.ant-select) { width: 100%; }
</style>
