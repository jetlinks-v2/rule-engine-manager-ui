<template>
  <a-button type="text" class="scene-filter-add-button" @click="emit('add')">
    <template #icon><AIcon type="PlusCircleOutlined" /></template>
    {{ $t('Terms.Branches.9093534-4') }}
  </a-button>
</template>

<script setup lang="ts">
const emit = defineEmits<{ add: [] }>()
</script>

<style scoped>
.scene-filter-add-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1, 4px);
  width: 100%;
  height: 2.5rem;
  color: var(--ant-color-text-secondary);
  font-weight: 400;
}
.scene-filter-add-button:hover {
  color: var(--ant-color-primary);
  background: var(--ant-color-fill-quaternary);
}
</style>
