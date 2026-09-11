<template>
  <a-select
    :value="modelValue"
    :options="options"
    :placeholder="placeholder || t('IotSceneLinkage.placeholder.thingModel')"
    :allow-clear="allowClear"
    :disabled="disabled"
    show-search
    :filter-option="filterOption"
    @change="change"
    @dropdownVisibleChange="$emit('dropdownVisibleChange', $event)"
  >
    <template #option="option">
      <ThingModelOptionView v-if="optionValue(option).value" :option="optionValue(option)" />
      <span v-else>{{ optionValue(option).label }}</span>
    </template>
  </a-select>
</template>

<script setup lang="ts">
import { type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ThingModelOption } from '../thingModel'
import ThingModelOptionView from './ThingModelOption.vue'

type ThingModelOptionGroup = {
  label: string
  options: ThingModelOption[]
}

defineProps({
  modelValue: { type: String, default: undefined },
  options: { type: Array as PropType<Array<ThingModelOption | ThingModelOptionGroup>>, default: () => [] },
  placeholder: { type: String, default: '' },
  allowClear: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'change', 'dropdownVisibleChange'])

const { t } = useI18n()

const change = (value: string) => {
  emit('update:modelValue', value)
  emit('change', value)
}

const optionValue = (option: any): ThingModelOption =>
  option?.data?.value ? option.data : option

const filterOption = (input: string, option: any) => {
  const keyword = input.trim().toLocaleLowerCase()
  if (!keyword) return true
  const item = optionValue(option)
  return [item.label, item.value]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase().includes(keyword))
}
</script>
