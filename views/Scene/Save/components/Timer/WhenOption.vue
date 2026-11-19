<template>
  <div :class="['timer-when-warp', { 'timer-when-warp--month': type === 'month' }]">
    <button type="button" :aria-pressed="allActive" :class='["when-item-option", allActive ? "active" : ""]' @click='() => change(0)'>{{ $t('Timer.WhenOption.9093535-0') }}</button>
    <button type="button"
      v-for='item in timeOptions'
      :key="item.value"
      :aria-pressed="rowKeys.includes(item.value)"
      :class='["when-item-option", rowKeys.includes(item.value) ? "active" : ""]'
      @click='() => change(item.value)'
    >
      {{ item.label }}
    </button>
  </div>
</template>

<script setup lang='ts'>
import type { PropType } from 'vue'
import { numberToString } from './util'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'WhenOption' })

const { t: $t } = useI18n()
type Emit = {
  (e: 'update:value', data: Array<number>):void
  (e: 'change', data: Array<number>):void
}

const props = defineProps({
  value: {
    type: Array as PropType<Array<number>>,
    default: []
  },
  type: {
    type: String,
    default: ''
  }
})

const emit = defineEmits<Emit>()

const timeOptions = ref<Array<{ label: string, value: number}>>([])
const rowKeys = ref<Array<number>>(props.value)

const change = (number: number) => {
  const _keys = new Set(rowKeys.value)
  if (number === 0) { // 全选
    _keys.clear()
  } else {
    if (_keys.has(number)) {
      _keys.delete(number)
    } else {
      _keys.add(number)
    }
  }
  rowKeys.value = [..._keys.values()].sort((a, b) => a - b )
  emit('update:value', rowKeys.value)
  emit('change', rowKeys.value)
}

const allActive = computed(() => {
  return !rowKeys.value.length
})

watch(() => props.type, () => {
  const isMonth = props.type === 'month'
  const day = isMonth ? 31 : 7
  if (!props.value.length) {
    change(0)
  }
  timeOptions.value = new Array(day)
    .fill(1)
    .map((_, index) => {
      const _value = index + 1
      return {
        label: isMonth ? $t('Timer.WhenOption.9093535-1', [_value]) : numberToString[_value],
        value: _value
      }
    })
}, { immediate: true })

</script>

<style scoped>
.timer-when-warp { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.timer-when-warp--month { grid-template-columns: repeat(7, minmax(0, 1fr)); }
.when-item-option { min-width: 0; min-height: 32px; padding: 4px; color: var(--ant-color-text, #262626); text-align: center; background: var(--ant-color-bg-container, #fff); border: 1px solid var(--ant-color-border, #d9d9d9); border-radius: 4px; cursor: pointer; }
.when-item-option.active { color: var(--ant-color-primary, #1677ff); border-color: var(--ant-color-primary, #1677ff); background: var(--ant-color-primary-bg, #e6f4ff); }
.when-item-option:focus-visible { outline: 2px solid var(--ant-color-primary, #1677ff); outline-offset: 2px; }
</style>
