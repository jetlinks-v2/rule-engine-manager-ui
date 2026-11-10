<template>
  <section class="legacy-action-summary">
    <div>
      <strong>{{ $t('IotSceneLinkage.detail.legacyAction') }}</strong>
      <p>{{ summary }}</p>
      <small>{{ $t('IotSceneLinkage.detail.legacyActionHint') }}</small>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  options: { type: Object, default: () => ({}) },
})

const summary = computed(() => props.options?.name || props.data?.executor || '')
</script>

<style scoped>
.legacy-action-summary { display: flex; gap: var(--space-3, 12px); align-items: flex-start; padding: var(--space-4, 16px); color: var(--ant-color-text-secondary); background: var(--ant-color-fill-quaternary); border: 1px dashed var(--ant-color-border); border-radius: var(--radius-jet-sm, 8px); }.legacy-action-summary__icon { display: grid; flex: none; place-items: center; width: 30px; height: 30px; color: var(--ant-color-text-tertiary); background: var(--ant-color-fill-secondary); border-radius: 6px; }.legacy-action-summary > div { display: grid; gap: 4px; }.legacy-action-summary strong { color: var(--ant-color-text); font-weight: 600; }.legacy-action-summary p { margin: 0; overflow-wrap: anywhere; }.legacy-action-summary small { color: var(--ant-color-text-tertiary); font-size: 12px; }
</style>
