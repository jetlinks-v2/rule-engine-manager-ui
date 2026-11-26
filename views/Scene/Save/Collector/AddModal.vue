<template>
  <a-modal open :title="$t('Device.index.372524-0')" :width="1240" :footer="null" :mask-closable="false" @cancel="$emit('cancel')">
    <section class="collector-trigger-workspace">
      <CollectorResourceWorkspace :resources="resourceView" :options="options" :selected-ids="selectedIds" @select-point="typeRef?.selectPoint($event)">
        <Type :key="collectorId" ref="typeRef" compact :operator="configuration.operator" :collector-config="configuration" :collector-id="collectorId" :point-list="points" @type-change="handlerType = $event" @points-change="selectedIds = $event" />
      </CollectorResourceWorkspace>
      <footer><a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button><a-button type="primary" :disabled="!collectorId || pointsLoading || pointsError" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button></footer>
    </section>
  </a-modal>
</template>

<script setup lang="ts">
import type { TriggerCollector } from '../../typings'
import Type from './Type.vue'
import CollectorResourceWorkspace from '../action/Collector/CollectorResourceWorkspace.vue'
import { useCollectorTriggerDraft } from './useCollectorTriggerDraft'

const props = defineProps<{ value: TriggerCollector; options: Record<string, any> }>()
const emit = defineEmits<{ cancel: []; save: [value: TriggerCollector, options: Record<string, any>] }>()
const { resourceView, collectorId, points, pointsLoading, pointsError, selectedIds, typeRef, configuration, handlerType, save } = useCollectorTriggerDraft(props, (value, options) => emit('save', value, options))
</script>

<style scoped>
.collector-trigger-workspace { display: grid; gap: var(--space-4, 16px); }
.collector-trigger-workspace footer { display: flex; justify-content: flex-end; gap: var(--space-2, 8px); }
</style>
