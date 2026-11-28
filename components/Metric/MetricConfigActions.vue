<template>
  <span class="metric-config-actions"><a-dropdown :trigger="['click']">
    <a-button type="text" size="small" class="metric-config-actions__trigger" :aria-label="t('metricActions')" :title="t('metricActions')" :aria-busy="!!busy" :disabled="busy || disabled"><AIcon :type="busy ? 'LoadingOutlined' : 'MoreOutlined'" :spin="!!busy" /></a-button>
    <template #overlay>
      <a-menu class="metric-config-actions__menu">
        <template v-if="editable"><a-menu-item key="edit" :disabled="busy || disabled" @click="emit('edit')"><template #icon><AIcon type="EditOutlined" /></template>{{ t('edit') }}</a-menu-item>
        <a-menu-item key="toggle" :disabled="busy || disabled" @click="emit('toggle')"><template #icon><AIcon :type="configuration.state === 'enabled' ? 'PauseCircleOutlined' : 'PlayCircleOutlined'" /></template>{{ t(configuration.state === 'enabled' ? 'disable' : 'enable') }}</a-menu-item>
        <a-menu-divider />
        <a-menu-item key="remove" danger :disabled="busy || disabled" @click="emit('remove')"><template #icon><AIcon type="DeleteOutlined" /></template>{{ t('deleteMetric') }}</a-menu-item></template>
        <slot name="extra" />
      </a-menu>
    </template>
  </a-dropdown></span>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { metricMessages } from './messages'
import type { MetricConfig } from './types'
withDefaults(defineProps<{ configuration: MetricConfig; editable?:boolean; busy?: boolean; disabled?:boolean }>(),{editable:true})
const emit = defineEmits<{ (event: 'edit'): void; (event: 'toggle'): void; (event: 'remove'): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
</script>
<style scoped>
.metric-config-actions { display:inline-flex; align-items:center; flex-shrink:0 }
.metric-config-actions__trigger { width:28px;height:28px;padding:0 }
.metric-config-actions__menu { min-width:148px }
</style>
