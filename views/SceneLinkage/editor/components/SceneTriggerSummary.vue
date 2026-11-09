<template><SceneSummaryParts :parts="parts" /></template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { QuickTriggerSummaryForm } from '../quickTriggerSummary'
import type { SceneRuleRecord } from '../editorMode'
import SceneSummaryParts from './SceneSummaryParts.vue'
import { quickTriggerSummaryParts } from '../quickTriggerSummary'
import { detailedTriggerSummaryParts } from '../detailedTriggerSummary'

const props = defineProps<{ form?: QuickTriggerSummaryForm; rule?: SceneRuleRecord }>()
const { t } = useI18n()
// 两种模式只共享阅读语言，不共享或转换可编辑草稿。
const parts = computed(() => props.form ? quickTriggerSummaryParts(props.form, t) : detailedTriggerSummaryParts(props.rule?.trigger || {}, props.rule?.options?.trigger || {}, t, props.rule?.triggerType || '', props.rule))
</script>
