<template>
  <div class="alarm-handling-panel" :class="{ 'is-single': source }">
    <a-alert v-if="!entry && !isEdit" type="warning" show-icon :message="t('alarmDashboard.handling.unavailable')" />
    <a-spin :spinning="loading && !isEdit">
      <div class="alarm-handling-panel__grid">
        <div v-for="source in sources" :key="source.key" class="alarm-handling-panel__source">
          <component :is="entry" v-if="entry && !isEdit" :category="source.category" :title="source.title" :count="source.data.active ?? undefined"
            :disabled="source.data.failed" :can-configure="false" :query-terms="terms" :scope-key="scopeKey" @handled="$emit('handled')">
            <template #trigger="{ open, disabled, setOpen }">
              <AlarmHandlingCard :title="source.title" :data="source.data" :standalone="Boolean(props.source)" :vision="source.key === 'vision'" :expanded="open" :disabled="disabled"
                @activate="setOpen(!open)" @retry="$emit('retry')" />
            </template>
          </component>
          <AlarmHandlingCard v-else :title="source.title" :data="source.data" :standalone="Boolean(props.source)" :vision="source.key === 'vision'" disabled @retry="$emit('retry')" />
        </div>
      </div>
    </a-spin>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AlarmHandlingData, AlarmHandlingSource, AlarmQueryRange } from '../dashboard.types'
import { timeTerms } from '../services/query'
import { useAlarmHandlingEntry } from '../hooks/useAlarmHandlingEntry'
import AlarmHandlingCard from './AlarmHandlingCard.vue'
const props = defineProps<{ value?: AlarmHandlingData; source?: AlarmHandlingSource; window?: AlarmQueryRange; scopeKey: string; isEdit: boolean; loading: boolean }>()
defineEmits<{ handled: []; retry: [] }>()
const { t } = useI18n()
const entry = useAlarmHandlingEntry()
const unavailable = { total: null, active: null, handled: null, rate: null, failed: true }
const sources = computed(() => [
  { key: 'iot', category: 'deviceAlarm', title: t('alarmDashboard.source.iot'), data: props.value?.iot ?? unavailable },
  { key: 'vision', category: 'visionAlarm', title: t('alarmDashboard.source.vision'), data: props.value?.vision ?? unavailable },
].filter(source => !props.source || source.key === props.source))
const terms = computed(() => props.window ? timeTerms(props.window) : [])
</script>
<style scoped>
.alarm-handling-panel { container: alarm-handling / inline-size; display: flex; flex-direction: column; justify-content: center; flex: 1; min-width: 0; min-height: 0; }
.alarm-handling-panel__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; min-width: 0; }
.alarm-handling-panel__source { min-width: 0; padding-right: 20px; }
.alarm-handling-panel__source + .alarm-handling-panel__source { padding: 0 0 0 20px; border-left: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.alarm-handling-panel.is-single .alarm-handling-panel__grid { grid-template-columns: minmax(0, 1fr); }
.alarm-handling-panel.is-single .alarm-handling-panel__source { padding: 0; border: 0; }
.alarm-handling-panel > :deep(.ant-alert) { margin-bottom: 12px; }
@container alarm-handling (max-width: 480px) {
  .alarm-handling-panel__grid { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .alarm-handling-panel__source { padding-right: 0; }
  .alarm-handling-panel__source + .alarm-handling-panel__source { border-left: 0; border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); padding: 16px 0 0; }
}
</style>
