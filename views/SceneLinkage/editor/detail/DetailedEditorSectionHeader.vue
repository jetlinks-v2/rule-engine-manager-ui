<template>
  <header class="detailed-scene-editor__section-header">
    <AIcon class="scene-editor__section-symbol" :type="kind === 'action' ? 'PlayCircleOutlined' : 'ThunderboltOutlined'" aria-hidden="true" />
    <h2>{{ $t(titleKey) }}</h2>
    <a-tooltip :title="$t(hintKey)"><a-button type="text" size="small" :aria-label="$t(hintKey)"><AIcon type="QuestionCircleOutlined" /></a-button></a-tooltip>
    <DocumentHelp v-if="kind === 'action'" code="rule-engine/Scene" help-key="scene.actions" />
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DocumentHelp from '@jetlinks-web-core/components/DocumentHelp'

const props = defineProps<{ kind: 'trigger' | 'action' }>()
const titleKey = computed(() => props.kind === 'action' ? 'IotSceneLinkage.detail.executionRule' : 'IotSceneLinkage.detail.triggerRule')
const hintKey = computed(() => `${titleKey.value}Hint`)
</script>
