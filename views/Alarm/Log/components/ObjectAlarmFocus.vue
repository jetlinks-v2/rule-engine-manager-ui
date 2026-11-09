<template>
  <a-select
    :value="parameters.alarmConfigIds || []"
    :options="options"
    :loading="loading"
    :disabled="disabled"
    :placeholder="t('ObjectPresentation.allAlarmRules')"
    mode="multiple"
    show-search
    :filter-option="false"
    style="width: 100%"
    @search="search"
    @popup-scroll="scroll"
    @change="change"
  />
  <a-alert
    v-if="error"
    type="warning"
    :message="error"
  />
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { queryList } from '../../../../api/configuration'
const props = defineProps<{ parameters: Record<string, unknown>; disabled?: boolean }>()
const emit = defineEmits<{ change: [parameters: Record<string, unknown>] }>()
const { t } = useI18n()
const options = ref<Array<{ value: string; label: string }>>([]),
  loading = ref(false),
  error = ref('')
let generation = 0,
  keyword = '',
  page = 0,
  hasMore = true,
  timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})
async function load(reset = false) {
  if (!reset && (loading.value || !hasMore)) return
  const current = ++generation,
    index = reset ? 0 : page + 1
  loading.value = true
  error.value = ''
  try {
    const response = await queryList({
      pageIndex: index,
      pageSize: 50,
      sorts: [{ name: 'id', order: 'asc' }],
      terms: keyword ? [{ column: 'name', termType: 'like', value: `%${keyword}%` }] : []
    })
    if (current !== generation) return
    if (!response.success) throw new Error(response.message || t('ObjectPresentation.rulesUnavailable'))
    const rows = (response.result?.data || []) as Array<{ id: string; name?: string }>
    const next = new Map(
      (reset
        ? options.value.filter(
            (item) =>
              Array.isArray(props.parameters.alarmConfigIds) && props.parameters.alarmConfigIds.includes(item.value)
          )
        : options.value
      ).map((item) => [item.value, item])
    )
    rows.forEach((row) => next.set(row.id, { value: row.id, label: row.name || row.id }))
    options.value = [...next.values()]
    page = index
    hasMore = rows.length === 50
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (current === generation) loading.value = false
  }
}
function search(value: string) {
  generation++
  keyword = value
  clearTimeout(timer)
  timer = setTimeout(() => load(true), 250)
}
function scroll(event: Event) {
  const element = event.target as HTMLElement
  if (element.scrollTop + element.clientHeight >= element.scrollHeight - 24) void load()
}
function change(value: unknown) {
  if (Array.isArray(value)) emit('change', { ...props.parameters, alarmConfigIds: value.slice(0, 20) })
}
void load(true)
</script>
