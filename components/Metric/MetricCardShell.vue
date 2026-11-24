<template>
  <article class="metric-card-shell">
    <header class="metric-card-shell__head">
      <span class="metric-card-shell__icon"><AIcon :type="icon || 'DashboardOutlined'" /></span>
      <span class="metric-card-shell__title" :title="title">{{ title }}</span>
      <slot name="actions" />
    </header>
    <slot />
  </article>
</template>
<script setup lang="ts">
defineProps<{title:string;icon?:string}>()
</script>
<style scoped>
.metric-card-shell{display:flex;flex-direction:column;min-width:0;height:100%;border:1px solid var(--line);border-radius:var(--r-3,8px);background:var(--panel-background);overflow:hidden}
.metric-card-shell:hover{border-color:var(--accent)}
.metric-card-shell__head{display:flex;align-items:center;gap:6px;padding:12px 12px 0 16px;min-width:0;min-height:44px}
.metric-card-shell__icon{display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);width:26px;height:26px;border-radius:6px;flex:none}
.metric-card-shell__title{min-width:0;flex:1;font-size:var(--fs-14,14px);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
