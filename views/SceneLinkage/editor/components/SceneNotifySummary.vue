<template><SceneSummaryParts :parts="parts" /></template>

<script setup lang="ts">
import { computed } from 'vue'
import SceneSummaryParts from './SceneSummaryParts.vue'
import { notificationSummaryParts } from '../actionNodeSummary'
import { useI18n } from 'vue-i18n'
import type { SceneNotifyUser, SceneNotifyMethod } from '../../../../api/scene-linkage'
import { getNotificationSummary } from '../notificationSummary'
import { useSceneNotifyLabels } from '../detail/useSceneNotifyLabels'

const props = defineProps<{
  config?: { userIds?: string[]; notifyChannelIds?: string[] }
  options?: Record<string, any>
  users?: SceneNotifyUser[]
  methods?: SceneNotifyMethod[]
}>()
const { t } = useI18n()
const labels = useSceneNotifyLabels()
const summary = computed(() => getNotificationSummary(props.config, props.options, t, props.users || labels.users.value, props.methods || labels.methods.value))
const parts = computed(() => notificationSummaryParts(summary.value, t))
</script>
