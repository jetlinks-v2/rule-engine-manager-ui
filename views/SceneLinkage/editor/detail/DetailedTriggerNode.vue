<template>
  <SceneNodeCard variant="trigger" :title="title" :icon="icon" :number="$t('IotSceneLinkage.editor.conditionNumber', { index: 1 })">
    <template #actions>
      <a-tooltip v-if="type !== 'manual'" :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="emit('edit')"><AIcon type="EditOutlined" /></a-button></a-tooltip>
      <a-button type="text" danger :aria-label="$t('IotSceneLinkage.action.delete')" @click="emit('remove')"><AIcon type="DeleteOutlined" /></a-button>
    </template>
    <SceneTriggerSummary :rule="rule" />
  </SceneNodeCard>
</template>

<script setup lang="ts">
import SceneTriggerSummary from '../components/SceneTriggerSummary.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SceneNodeCard from '../components/SceneNodeCard.vue'
import { toForm } from '../../utils'
import type { SceneRuleRecord } from '../editorMode'

const props = defineProps<{ rule: SceneRuleRecord }>()
const emit = defineEmits<{ edit: []; remove: [] }>()
const { t } = useI18n()
const type = computed(() => String(props.rule.trigger?.type || props.rule.triggerType || ''))
// 快速表单仅作只读显示投影；编辑和保存仍使用传入的原生触发器。
const form = computed(() => toForm(props.rule))
const kind = computed(() => type.value === 'device' || type.value === 'timer' ? form.value.triggerKind : type.value)
const title = computed(() => type.value === 'device' ? t('IotSceneLinkage.node.deviceTrigger') : type.value === 'timer' ? t('IotSceneLinkage.triggerType.timer') : type.value === 'collector'
  ? t('IotSceneLinkage.triggerType.collector')
  : type.value === 'alarm'
    ? t('IotSceneLinkage.trigger.alarm')
    : t(`IotSceneLinkage.trigger.${kind.value}`))
const icon = computed(() => ({ property: 'RiseOutlined', event: 'NotificationOutlined', online: 'LoginOutlined', offline: 'LogoutOutlined', state: 'SyncOutlined', repeat: 'ClockCircleOutlined', interval: 'SyncOutlined', date: 'CalendarOutlined', manual: 'ThunderboltOutlined', collector: 'DatabaseOutlined', alarm: 'AlertOutlined', 'ai-event': 'RadarChartOutlined' }[kind.value] || 'ThunderboltOutlined'))
</script>
