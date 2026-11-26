<template>
  <SceneNotifySummary :config="data.configuration" :options="data.options" />
</template>

<script setup lang="ts">
import SceneNotifySummary from '@rule-engine-manager-ui/views/SceneLinkage/editor/components/SceneNotifySummary.vue'
// 通用动作详情会传入额外 options，避免其透传覆盖摘要显式绑定的元数据。
defineOptions({ inheritAttrs: false })
defineProps({ data: { type: Object, default: () => ({}) } })
</script>
