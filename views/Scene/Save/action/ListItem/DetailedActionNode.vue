<template>
  <SceneNodeCard :title="title" :icon="icon" :number="index + 1">
    <template v-if="!readOnly" #actions>
      <a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="emit('edit')"><AIcon type="EditOutlined" /></a-button></a-tooltip>
      <ConfirmModal :title="$t('ListItem.Item.637563-18')" :on-confirm="() => emit('remove')">
        <a-button type="text" danger :aria-label="$t('ListItem.Item.637563-18')"><AIcon type="DeleteOutlined" /></a-button>
      </ConfirmModal>
    </template>
    <SceneActionSummary v-if="action.executor === 'delay'" :action="displayAction" />
    <component v-else-if="action.executor" :is="ComponentsMap[action.executor]" :data="displayAction" :options="displayAction.options" :read-only="readOnly" @visible-change="emit('visible-change', $event)" />
    <a-button v-else @click="emit('edit')">{{ $t('ListItem.Item.637563-17') }}</a-button>
  </SceneNodeCard>
</template>

<script setup lang="ts">
import { computed, inject, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SceneProviderInfo } from '@rule-engine-manager-ui/api/scene-linkage'
import SceneNodeCard from '@rule-engine-manager-ui/views/SceneLinkage/editor/components/SceneNodeCard.vue'
import ComponentsMap from './detail'
import SceneActionSummary from '@rule-engine-manager-ui/views/SceneLinkage/editor/components/SceneActionSummary.vue'

const props = defineProps<{ action: Record<string, any>; options?: Record<string, any>; index: number; readOnly: boolean }>()
const emit = defineEmits<{ edit: []; remove: []; 'visible-change': [value: boolean] }>()
const { t } = useI18n()
const providers = inject<Ref<SceneProviderInfo[]>>('action-options')
const title = computed(() => {
  const type = props.action.executor
  if (type === 'sceneNotify') return t('IotSceneLinkage.action.sendNotify')
  if (type === 'device' || type === 'delay') return t(`IotSceneLinkage.action.${type}`)
  return providers?.value.find(provider => provider.provider === type)?.name || props.options?.type || t('IotSceneLinkage.detail.legacyAction')
})
const icon = computed(() => ({ device: 'ControlOutlined', delay: 'ClockCircleOutlined', sceneNotify: 'NotificationOutlined', collector: 'DatabaseOutlined', 'device-data': 'DatabaseOutlined', 'alarm-record-query': 'SearchOutlined' }[String(props.action.executor)] || 'PlayCircleOutlined'))
// 只合并展示元数据，不把摘要投影写回原生动作树。
const displayAction = computed(() => ({ ...props.action, options: { ...props.action.options, ...props.options } }))
</script>
