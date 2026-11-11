<template>
  <div class="alarm-configuration-guide" :class="'alarm-configuration-guide--' + mode" role="status">
    <div v-for="item in items" :key="item.source" class="alarm-configuration-item">
      <span>
        {{ t('alarmDashboard.configuration.' + item.status + '.' + item.source) }}
      </span>
      <a-button v-if="item.action" type="link" size="small" @click="$emit('open', item.action)">
        {{ t('alarmDashboard.action.' + item.action) }}
      </a-button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AlarmConfigurationHint } from '../services/configuration'
withDefaults(defineProps<{ items: AlarmConfigurationHint[]; mode?: 'compact' | 'inline' | 'empty' }>(), { mode: 'inline' })
defineEmits<{ open: [key: string] }>()
const { t } = useI18n()
</script>
<style scoped>
.alarm-configuration-guide { flex: none; color: var(--ink-3, #86909c); font-size: 12px; line-height: 18px; }
.alarm-configuration-item { display: flex; align-items: center; flex-wrap: wrap; gap: 0 4px; }
.alarm-configuration-item :deep(.ant-btn) { height: auto; padding: 0; font-size: inherit; line-height: inherit; white-space: normal; text-align: inherit; }
.alarm-configuration-guide--inline { margin-bottom: 8px; }
.alarm-configuration-guide--compact { max-width: 50%; text-align: right; }
.alarm-configuration-guide--compact .alarm-configuration-item { flex-direction: column; align-items: flex-end; }
.alarm-configuration-guide--empty { display: flex; flex: 1; flex-direction: column; justify-content: center; align-items: center; gap: 8px; }
.alarm-configuration-guide--empty .alarm-configuration-item { justify-content: center; text-align: center; }
</style>
