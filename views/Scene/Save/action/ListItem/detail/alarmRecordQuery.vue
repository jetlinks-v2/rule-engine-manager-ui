<template>
  <span>{{ $t('IotSceneLinkage.summary.queryAlarmRecords') }}{{ targetName ? `：${targetName}` : '' }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  options: { type: Object, default: () => ({}) },
})

// 告警状态查询由“附加条件”生成，详细模式仅展示已有节点，避免它被当作普通执行动作重新配置。
const targetName = computed(() => props.options?.name || props.options?.alarmConfigName || '')
</script>
