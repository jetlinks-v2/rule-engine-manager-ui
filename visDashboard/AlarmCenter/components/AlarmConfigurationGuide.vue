<template>
  <CloudEmpty class="alarm-configuration-empty" :image-style="{ height: '40px' }" role="status">
    <template #description>
      <div class="alarm-empty-title">{{ empty.title }}</div>
      <div class="alarm-empty-description">{{ empty.description }}</div>
    </template>
    <div v-if="items.some(item => item.action)" class="alarm-empty-actions">
      <template v-for="item in items" :key="item.source">
        <a-button v-if="item.action" type="primary" size="small" @click="$emit('open', item.action)">
          {{ t(items.length > 1 ? 'alarmDashboard.empty.configure.' + item.source : 'alarmDashboard.empty.configure') }}
        </a-button>
      </template>
    </div>
  </CloudEmpty>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AlarmConfigurationHint } from '../services/configuration'
// 多来源入口保留来源名称，单来源使用统一短文案；配置动作由外层按菜单权限提供。
defineProps<{ items: AlarmConfigurationHint[]; empty: { title: string; description: string } }>()
defineEmits<{ open: [key: string] }>()
const { t } = useI18n()
</script>
<style scoped>
.alarm-configuration-empty { display: flex; flex: 1; min-width: 0; min-height: 0; height: 100%; align-items: center; justify-content: safe center; flex-direction: column; padding: 8px; box-sizing: border-box; overflow: auto; container: alarm-empty / size; }
.alarm-configuration-empty :deep(.ant-empty) { margin: 0; max-width: 100%; flex-shrink: 0; }
.alarm-configuration-empty :deep(.ant-empty-image) { margin-bottom: 8px; }
.alarm-configuration-empty :deep(.ant-empty-image img) { display: block; margin-inline: auto; max-height: 100%; object-fit: contain; }
.alarm-configuration-empty :deep(.ant-empty-description) { margin: 0; }
.alarm-configuration-empty :deep(.ant-empty-footer) { margin-top: 8px; }
.alarm-empty-title { margin-bottom: 4px; color: #1f2937; font-size: 14px; font-weight: 500; line-height: 20px; }
.alarm-empty-description { max-width: 280px; margin-inline: auto; color: #8c8c8c; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.alarm-empty-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.alarm-empty-actions :deep(.ant-btn) { height: auto; min-height: 24px; padding: 0 8px; border-radius: 4px; font-size: 12px; white-space: normal; }
@container alarm-empty (max-height: 120px) {
  .alarm-configuration-empty :deep(.ant-empty-image) { display: none; }
}
/* 短窄卡片优先完整展示两类配置操作。 */
@container alarm-empty (max-width: 240px) and (max-height: 180px) {
  .alarm-configuration-empty :deep(.ant-empty-image) { display: none; }
}
</style>
