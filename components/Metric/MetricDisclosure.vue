<template>
  <details class="metric-disclosure">
    <summary><AIcon type="RightOutlined" class="metric-disclosure__chevron" /><AIcon :type="icon" /><span>{{ title }}</span></summary>
    <div class="metric-disclosure__content"><slot /></div>
  </details>
</template>
<script setup lang="ts">
defineProps<{ title: string; icon: string }>()
</script>
<style scoped>
.metric-disclosure { min-width:0; border-top:1px solid var(--line) }
.metric-disclosure > summary { display:flex; align-items:center; gap:6px; min-height:32px; padding:0 2px; list-style:none; cursor:pointer; color:var(--ink-2); font-size:var(--fs-12,12px); line-height:1.5; border-radius:var(--r-1,4px) }
.metric-disclosure > summary::-webkit-details-marker { display:none }
.metric-disclosure > summary:hover { background:var(--bg-hover); color:var(--ink-1) }
.metric-disclosure > summary:focus-visible { outline:2px solid var(--accent); outline-offset:2px }
.metric-disclosure__chevron { flex:none; font-size:10px; color:var(--ink-3); transition:transform .15s }
.metric-disclosure[open] .metric-disclosure__chevron { transform:rotate(90deg) }
.metric-disclosure__content { min-width:0; padding:4px 0 10px }
</style>
