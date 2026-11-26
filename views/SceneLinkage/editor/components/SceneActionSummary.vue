<template><SceneSummaryParts :parts="parts" /></template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SceneRuleRecord } from '../editorMode'
import SceneSummaryParts from './SceneSummaryParts.vue'
import { actionNodeSummaryParts } from '../actionNodeSummary'
import { useSceneNotifyLabels } from '../detail/useSceneNotifyLabels'

const props = defineProps<{ action: SceneRuleRecord; options?: SceneRuleRecord }>()
const { t } = useI18n()
const labels = useSceneNotifyLabels()
// 只合并摘要元数据；保留原生动作树及其参数，不向配置写入展示片段。
const parts = computed(() => actionNodeSummaryParts({ ...props.action, options: { ...props.action.options, ...props.options } }, t, { users: labels.users.value, methods: labels.methods.value }))
</script>
