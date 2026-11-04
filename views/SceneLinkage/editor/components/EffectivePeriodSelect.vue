<template>
  <div class="effective-period-select">
    <a-select :value="selectedPeriod" :options="options" @change="changePeriod" />
    <div v-if="selectedPeriod === 'custom'" class="effective-period-select__custom">
      <a-time-picker v-model:value="customStart" format="HH:mm" value-format="HH:mm" />
      <span>{{ $t('IotSceneLinkage.effectivePeriod.to') }}</span>
      <a-time-picker v-model:value="customEnd" format="HH:mm" value-format="HH:mm" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SceneTimeRange } from '../../utils'

type EffectivePeriod = 'all' | 'daytime' | 'night' | 'custom'

const props = defineProps({
  modelValue: { type: Array as PropType<SceneTimeRange[]>, required: true },
})
const emit = defineEmits<{ (event: 'update:modelValue', value: SceneTimeRange[]): void }>()

const { t } = useI18n()
const periodRanges: Record<Exclude<EffectivePeriod, 'custom'>, SceneTimeRange[]> = {
  all: [],
  daytime: [{ start: '08:00', end: '20:00' }],
  night: [{ start: '20:00', end: '08:00' }],
}
const options = computed(() => [
  { value: 'all', label: t('IotSceneLinkage.effectivePeriod.all') },
  { value: 'daytime', label: t('IotSceneLinkage.effectivePeriod.daytime') },
  { value: 'night', label: t('IotSceneLinkage.effectivePeriod.night') },
  { value: 'custom', label: t('IotSceneLinkage.effectivePeriod.custom') },
])

// 自定义时段需要先切换本地展示状态，再同步父级范围；不能只依赖异步的 v-model 回传。
const selectedPeriod = ref<EffectivePeriod>(findPeriod(props.modelValue))
function changePeriod(value: unknown) {
  if (value !== 'all' && value !== 'daytime' && value !== 'night' && value !== 'custom') return
  selectedPeriod.value = value
  if (value === 'custom') {
    const range = props.modelValue[0] || { start: '09:00', end: '18:00' }
    emit('update:modelValue', [{ ...range }])
    return
  }
  emit('update:modelValue', periodRanges[value].map(range => ({ ...range })))
}

const customStart = computed({
  get: () => props.modelValue[0]?.start || '09:00',
  set: start => updateCustomRange(start, customEnd.value),
})
const customEnd = computed({
  get: () => props.modelValue[0]?.end || '18:00',
  set: end => updateCustomRange(customStart.value, end),
})

/** A quick effective period is one daily range; additional time conditions remain independently configurable. */
function updateCustomRange(start: string, end: string) {
  emit('update:modelValue', [{ start, end }])
}

/**
 * 预设无法匹配时回显为自定义，每日范围的起止时间可直接在快速配置中维护。
 */
function findPeriod(ranges: SceneTimeRange[]): EffectivePeriod {
  const matchedPeriod = (Object.keys(periodRanges) as Array<Exclude<EffectivePeriod, 'custom'>>)
    .find(period => hasSameRanges(ranges, periodRanges[period]))
  return matchedPeriod || 'custom'
}

function hasSameRanges(left: SceneTimeRange[], right: SceneTimeRange[]): boolean {
  return left.length === right.length
    && left.every((range, index) => range.start === right[index]?.start && range.end === right[index]?.end)
}

watch(() => props.modelValue, ranges => {
  selectedPeriod.value = findPeriod(ranges)
}, { deep: true })
</script>

<style scoped>
.effective-period-select { display: grid; gap: var(--space-2, 8px); width: 100%; }
.effective-period-select__custom { display: flex; gap: var(--space-2, 8px); align-items: center; }
.effective-period-select__custom :deep(.ant-picker) { min-width: 0; flex: 1; }
</style>
