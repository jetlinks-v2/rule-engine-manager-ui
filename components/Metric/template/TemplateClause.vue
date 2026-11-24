<template>
  <section class="template-clause" :class="{ 'is-stacked':stacked }">
    <AIcon v-if="icon" :type="icon" class="template-clause__icon" />
    <div class="template-clause__body"><div v-if="title || $slots.title" class="template-clause__title"><slot name="title">{{ title }}</slot></div><div class="template-clause__content"><slot /></div><small v-if="hint">{{ hint }}</small></div>
  </section>
</template>
<script setup lang="ts">
defineProps<{ icon?: string; title?: string; hint?: string; stacked?:boolean }>()
</script>
<style scoped>
.template-clause { display:flex; align-items:flex-start; gap:var(--space-3,12px); padding:var(--space-3,12px) 0 }
.template-clause__icon { color:var(--ink-3); margin-top:5px }
.template-clause__body { min-width:0; flex:1 }
.template-clause__title { display:block; margin-bottom:var(--space-2,8px); color:var(--ink-2); font-size:var(--fs-12,12px) }
.template-clause__content { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-2,8px) }
.template-clause__content>* { max-width:100% }
.template-clause__body > small { display:block; color:var(--ink-3); margin-top:var(--space-2,8px) }
.template-clause.is-stacked { display:grid; grid-template-columns:16px minmax(0,1fr); align-items:center; gap:0 8px; padding:0; margin-bottom:16px }
.template-clause.is-stacked > .template-clause__icon { grid-column:1; grid-row:1; width:16px; margin:0; font-size:14px }
.template-clause.is-stacked > .template-clause__body { display:contents }
.template-clause.is-stacked > .template-clause__body > .template-clause__title { grid-column:2; grid-row:1; display:flex; align-items:center; gap:8px; min-height:32px; margin:0; color:var(--ink-2); font-size:13px; font-weight:500 }
.template-clause.is-stacked > .template-clause__body > .template-clause__content { grid-column:1/-1; display:block; margin-top:8px; min-width:0 }
.template-clause.is-stacked > .template-clause__body > small { grid-column:1/-1; font-size:12px; line-height:1.6 }
</style>
