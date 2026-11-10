<template>
  <article :class="['scene-node-card', `scene-node-card--${variant}`]">
    <header class="scene-node-card__header">
      <slot name="icon"><span class="scene-node-card__icon"><AIcon :type="icon" /></span></slot>
      <strong>{{ title }}</strong>
      <small v-if="number !== undefined">{{ number }}</small>
      <span v-if="$slots.actions" class="scene-node-card__actions"><slot name="actions" /></span>
    </header>
    <div class="scene-node-card__preview"><slot /></div>
  </article>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  icon?: string
  number?: string | number
  variant?: 'action' | 'trigger'
}>(), { icon: 'PlayCircleOutlined', variant: 'action' })
</script>

<style scoped>
.scene-node-card { overflow: hidden; color: var(--jet-theme-text, #1d2129); background: var(--jet-theme-bg-container, #fff); border: 1px solid var(--jet-theme-border-color-1, #e4e7ec); border-radius: var(--radius-jet-sm, 8px); }
.scene-node-card__header { display: flex; gap: var(--space-3, 12px); align-items: center; min-height: 48px; padding: var(--space-2, 8px) var(--space-4, 16px); background: #f7faff; }
.scene-node-card__header strong { min-width: 0; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.scene-node-card__header small { flex: none; color: var(--jet-theme-text-disabled, #86909c); }
.scene-node-card__icon { display: grid; flex: none; width: 28px; height: 28px; place-items: center; color: var(--jet-theme-primary, #1677ff); background: var(--jet-theme-primary-soft, #e8f0ff); border-radius: 6px; }
.scene-node-card__actions { display: inline-flex; flex: none; gap: 2px; align-items: center; margin-left: auto; }
.scene-node-card__preview { min-width: 0; padding: var(--space-4, 16px); overflow-wrap: anywhere; }
.scene-node-card--trigger { border-color: var(--jet-theme-border-color-1, #e4e7ec); }
.scene-node-card--trigger > header { background: #fffaf4; }
</style>
