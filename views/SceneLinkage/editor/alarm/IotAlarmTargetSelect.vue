<template>
  <a-select
    :value="modelValue"
    show-search
    allow-clear
    :filter-option="filterOption"
    :options="options"
    :placeholder="placeholder"
    :disabled="disabled"
    :loading="loading"
    :dropdown-match-select-width="dropdownMatchSelectWidth"
    @dropdownVisibleChange="handleVisibleChange"
    @search="handleSearch"
    @change="handleChange"
    @clear="handleClear"
  >
    <template v-if="rich" #option="option">
      <IotAlarmTargetOption :option="productOption(option)" :type="optionType" />
    </template>
  </a-select>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type PropType } from 'vue'
import IotAlarmTargetOption from './IotAlarmTargetOption.vue'

export type IotAlarmTargetSelectOption = {
  label: string
  value: string
  disabled?: boolean
  data?: unknown
}

export type IotAlarmTargetSelectQuery = {
  keyword: string
  pageIndex: number
  pageSize: number
}

const props = defineProps({
  modelValue: { type: String, default: undefined },
  request: { type: Function as PropType<(query: IotAlarmTargetSelectQuery) => Promise<{ data: IotAlarmTargetSelectOption[] }>>, required: true },
  staticOptions: { type: Array as PropType<IotAlarmTargetSelectOption[]>, default: () => [] },
  selectedOption: { type: Object as PropType<IotAlarmTargetSelectOption | undefined>, default: undefined },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  reloadKey: { type: [String, Number], default: '' },
  loadOnReload: { type: Boolean, default: false },
  rich: { type: Boolean, default: false },
  optionType: { type: String as PropType<'auto' | 'product' | 'device'>, default: 'auto' },
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string | undefined): void
  (event: 'change', value: string | undefined, option?: IotAlarmTargetSelectOption): void
}>()

const loading = ref(false)
const loaded = ref(false)
const keyword = ref('')
const remoteOptions = ref<IotAlarmTargetSelectOption[]>([])
let searchTimer: ReturnType<typeof setTimeout> | undefined

const dropdownMatchSelectWidth = computed(() => props.rich ? 336 : true)

const options = computed(() => {
  const staticOptions = [...props.staticOptions]
  const selectedOption = props.selectedOption
  const selectedOptions = selectedOption && !staticOptions.some((item) => item.value === selectedOption.value)
    ? [selectedOption]
    : []
  return [
    ...staticOptions,
    ...selectedOptions,
    ...remoteOptions.value.filter((option) => ![...staticOptions, ...selectedOptions].some((item) => item.value === option.value)),
  ]
})

const productOption = (option: any): IotAlarmTargetSelectOption =>
  option?.data?.label ? option.data : option

const filterOption = (input: string, option: any) => {
  const keyword = input.trim().toLocaleLowerCase()
  if (!keyword) return true
  const current = productOption(option)
  const product = current?.data as Record<string, any> || {}
  return [current?.label, current?.value, product.id]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase().includes(keyword))
}

async function load() {
  loading.value = true
  try {
    const page = await props.request({ keyword: keyword.value, pageIndex: 0, pageSize: 100 })
    remoteOptions.value = page.data
    loaded.value = true
  } finally {
    loading.value = false
  }
}

function handleVisibleChange(open: boolean) {
  if (open && !loaded.value) void load()
}

function handleSearch(value: string) {
  keyword.value = value.trim()
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void load(), 250)
}

function handleChange(value: unknown) {
  const nextValue = typeof value === 'string' ? value : undefined
  emit('update:modelValue', nextValue)
  emit('change', nextValue, nextValue ? options.value.find((item) => item.value === nextValue) : undefined)
}

function handleClear() {
  keyword.value = ''
  loaded.value = false
  remoteOptions.value = []
}

watch(
  () => props.reloadKey,
  () => {
    keyword.value = ''
    loaded.value = false
    remoteOptions.value = []
    if (props.loadOnReload) void load()
  },
)

onBeforeUnmount(() => searchTimer && clearTimeout(searchTimer))
</script>
