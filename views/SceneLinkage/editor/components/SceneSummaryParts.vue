<template>
  <span class="scene-summary-parts">
    <span v-for="(part, index) in parts" :key="index" :class="{ 'scene-summary-parts__field': part.field }" :title="part.title || (part.field ? part.text : undefined)">{{ part.text }}</span>
  </span>
</template>

<script setup lang="ts">
import type { SummaryPart } from '../summaryParts'
// 所有节点及规则预览共用正文排版；由容器提供展示片段，不读取或修改配置。
defineProps<{ parts: SummaryPart[] }>()
</script>

<style scoped>
.scene-summary-parts { display: inline; min-width: 0; line-height: 28px; color: var(--jet-theme-text, #1d2129); overflow-wrap: anywhere; }
.scene-summary-parts__field { display: inline; padding: 2px 6px; margin: 0 2px; color: var(--jet-theme-primary, #1677ff); background: var(--jet-theme-primary-soft, #eef4ff); border-radius: 4px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
</style>
