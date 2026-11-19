<template>
  <article :class="['scene-node-card', `scene-node-card--${variant}`]">
    <header class="scene-node-card__header">
      <slot name="icon"><span class="scene-node-card__icon"><AIcon :type="icon" /></span></slot>
      <div class="scene-node-card__identity">
        <a-tooltip :title="title"><strong>{{ title }}</strong></a-tooltip>
        <small v-if="number !== undefined">{{ variant === 'action' ? $t('IotSceneLinkage.editor.actionNumber', { index: number }) : number }}</small>
      </div>
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
.scene-node-card { display: grid; grid-template-columns: 24px 160px minmax(0, 1fr) 64px; gap: 12px; align-items: start; min-width: 0; min-height: 58px; padding: 12px; color: var(--jet-theme-text, #1d2129); background: var(--jet-theme-bg-container, #fff); border: 1px solid var(--jet-theme-border-color-1, #e4e7ec); border-radius: 6px; }
.scene-node-card__header { display: contents; }
.scene-node-card__header > :first-child { grid-column: 1; grid-row: 1; margin-top: 4px; }
.scene-node-card__identity { grid-column: 2; grid-row: 1; display: flex; align-items: baseline; gap: 8px; min-width: 0; line-height: 32px; }
.scene-node-card__header strong { min-width: 0; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scene-node-card__header small { flex: none; white-space: nowrap; color: var(--jet-theme-text-disabled, #86909c); }
.scene-node-card__icon { display: grid; width: 24px; height: 24px; place-items: center; color: var(--jet-theme-primary, #1677ff); background: var(--jet-theme-primary-soft, #e8f0ff); border-radius: 6px; }
.scene-node-card__actions { grid-column: 4; grid-row: 1; display: flex; gap: 0; align-items: center; justify-content: flex-end; }
.scene-node-card__actions :deep(.ant-btn) { flex: none; width: 32px; height: 32px; padding: 0; }
.scene-node-card__preview { grid-column: 3; grid-row: 1; min-width: 0; padding: 2px 0; overflow-wrap: anywhere; }
@container scene-workspace (max-width: 760px) {
  .scene-node-card { grid-template-columns: 24px minmax(0, 1fr) 64px; gap: 4px 12px; }
  .scene-node-card__actions { grid-column: 3; }
  .scene-node-card__preview { grid-column: 2 / -1; grid-row: 2; }
}
</style>
