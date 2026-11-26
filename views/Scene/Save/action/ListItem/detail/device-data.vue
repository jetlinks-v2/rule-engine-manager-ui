<template><SceneActionSummary :action="{ ...data, executor: 'device-data' }" :options="options" /></template>

<script setup lang="ts">
import SceneActionSummary from '@rule-engine-manager-ui/views/SceneLinkage/editor/components/SceneActionSummary.vue'
import type { SceneRuleRecord } from '@rule-engine-manager-ui/views/SceneLinkage/editor/editorMode'
// 旧详情入口与新版节点卡片共用只读摘要，不再各自拼接图标和资源名称。
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ data: SceneRuleRecord; options?: SceneRuleRecord }>(), { options: () => ({}) })
</script>
