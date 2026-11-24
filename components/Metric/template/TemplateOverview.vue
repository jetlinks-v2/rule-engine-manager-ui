<template>
  <svg class="template-overview" :viewBox="`0 0 ${graph.width} ${graph.height}`" :aria-label="`${template.name} · ${t('relations')}`" role="img">
    <defs>
      <marker :id="arrowId" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L7,4 L1,7" /></marker>
      <clipPath v-for="node in graph.nodes" :id="`${id}-${node.key}`" :key="node.key"><rect :x="node.x + 12" :y="node.y + 8" :width="layout.nodeWidth - 24" :height="layout.nodeHeight - 16" /></clipPath>
    </defs>
    <g v-for="level in graph.levels" :key="level.level" class="template-overview__level">
      <text x="4" :y="level.y + 17">{{ t(level.kind === 'input' ? 'inputs' : level.kind === 'output' ? 'outputs' : level.kind === 'mixed' ? 'graphCalculationAndOutput' : 'calculation') }}</text>
    </g>
    <path v-for="edge in graph.edges" :key="edge.key" class="template-overview__edge" :d="edge.path" :marker-end="`url(#${arrowId})`" />
    <g v-for="node in graph.nodes" :key="node.key" class="template-overview__node" :class="`template-overview__node--${node.kind}`">
      <title>{{ node.label }} · {{ summaries[node.key].text }} · {{ summaries[node.key].detail }}</title>
      <rect :x="node.x" :y="node.y" :width="layout.nodeWidth" :height="layout.nodeHeight" rx="6" />
      <g :clip-path="`url(#${id}-${node.key})`">
        <text class="template-overview__name" :x="node.x + 12" :y="node.y + 27">{{ node.label || t('unnamedOutput') }}</text>
        <text class="template-overview__meaning" :x="node.x + 12" :y="node.y + 50">{{ summaries[node.key].text }}</text>
        <text class="template-overview__detail" :x="node.x + 12" :y="node.y + 71">{{ summaries[node.key].detail }}</text>
      </g>
    </g>
  </svg>
</template>
<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import type { MetricTemplate } from '../types'
import { templateGraph, templateGraphLayout as layout } from './designer'
import { graphNodeSummary } from './graphPresentation'
const props = defineProps<{ template: MetricTemplate }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const id = useId()
const arrowId = `${id}-arrow`
// 概览沿用设计器的节点、依赖及摘要，不重建场景专用关系。
const graph = computed(() => templateGraph(props.template))
const summaries = computed(() => Object.fromEntries(graph.value.nodes.map(node => [node.key, graphNodeSummary(props.template, node, t)])))
</script>
<style scoped>
.template-overview { display:block; width:100%; height:144px; overflow:visible }
.template-overview__level text { fill:var(--ink-3); font-size:14px }
.template-overview marker path { fill:none; stroke:var(--ink-4); stroke-width:1.5 }
.template-overview__edge { fill:none; stroke:var(--ink-4); stroke-width:1.5 }
.template-overview__node rect { fill:var(--panel-background,#fff); stroke:var(--line); stroke-width:1.5 }
.template-overview__node--rule rect { fill:var(--accent-soft); stroke:var(--accent) }
.template-overview__node--output rect { stroke:var(--ink-4) }
.template-overview__name { fill:var(--ink-1); font-size:16px; font-weight:500 }
.template-overview__meaning { fill:var(--ink-2); font-size:13px }
.template-overview__detail { fill:var(--ink-3); font-size:12px }
</style>
