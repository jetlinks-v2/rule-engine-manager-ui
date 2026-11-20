<template>
  <a-button type="text" :class="['scene-filter-add-button', `scene-filter-add-button--${kind}`]" :aria-label="$t(label)" @click.stop="emit('add')">
    <template #icon><AIcon type="PlusOutlined" /></template>
    <template v-if="kind !== 'term'">{{ $t(label) }}</template>
  </a-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ kind?: 'filter' | 'term' | 'group' }>(), { kind: 'filter' })
const emit = defineEmits<{ add: [] }>()
const label = computed(() => props.kind === 'group' ? 'Terms.WhenItem.9093425-3' : props.kind === 'term' ? 'IotSceneLinkage.action.addCondition' : 'Terms.Branches.9093534-4')
</script>

<style scoped>
.scene-filter-add-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1, 4px);
  width: 100%;
  height: 36px;
  color: var(--ant-color-primary, #1677ff);
  background: var(--ant-color-bg-container, #fff);
  border: 1px dashed var(--ant-color-border, #d9d9d9);
  font-weight: 400;
}
.scene-filter-add-button:hover {
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg, #e6f4ff);
  border-color: var(--ant-color-primary, #1677ff);
}
.scene-filter-add-button--term, .scene-filter-add-button--group { flex: none; width: auto; height: 32px; margin-inline-start: 12px; padding-inline: 8px; }
.scene-filter-add-button--term { width: 32px; padding: 0; }
</style>
