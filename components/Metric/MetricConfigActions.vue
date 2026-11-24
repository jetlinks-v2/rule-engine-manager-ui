<template>
  <span class="metric-config-actions"><a-dropdown :trigger="['click']">
    <a-button type="text" size="small" :aria-label="t('metricActions')" :loading="busy"><AIcon type="MoreOutlined" /></a-button>
    <template #overlay>
      <a-menu>
        <a-menu-item key="edit" :disabled="busy" @click="emit('edit')"><AIcon type="EditOutlined" /> {{ t('edit') }}</a-menu-item>
        <a-menu-item key="toggle" :disabled="busy" @click="emit('toggle')"><AIcon :type="configuration.state === 'enabled' ? 'PauseCircleOutlined' : 'PlayCircleOutlined'" /> {{ t(configuration.state === 'enabled' ? 'disable' : 'enable') }}</a-menu-item>
        <a-menu-item key="remove" danger :disabled="busy" @click="emit('remove')"><AIcon type="DeleteOutlined" /> {{ t('deleteMetric') }}</a-menu-item>
      </a-menu>
    </template>
  </a-dropdown></span>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { metricMessages } from './messages'
import type { MetricConfig } from './types'
defineProps<{ configuration: MetricConfig; busy?: boolean }>()
const emit = defineEmits<{ (event: 'edit'): void; (event: 'toggle'): void; (event: 'remove'): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
</script>
<style scoped>
.metric-config-actions { display:inline-flex; align-items:center; flex-shrink:0 }
</style>
