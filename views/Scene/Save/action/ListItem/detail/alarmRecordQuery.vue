<template>
  <span>{{ $t('IotSceneLinkage.summary.queryAlarmRecords') }}{{ targetName ? `：${targetName}` : '' }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  options: { type: Object, default: () => ({}) },
})

// 告警记录查询既可由快速模式的附加条件生成，也可在详细模式作为普通执行动作配置。
const targetName = computed(() => props.options?.name || props.options?.alarmConfigName || '')
</script>
