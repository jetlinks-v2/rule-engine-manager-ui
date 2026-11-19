<template>
  <section class="scene-config-preview" role="region" :aria-label="$t('IotSceneLinkage.title.configPreview')" tabindex="0">
    <span class="scene-config-preview__label">{{ $t('IotSceneLinkage.title.configPreview') }}</span>
    <div class="scene-config-preview__content"><span v-if="hint" class="scene-config-preview__hint">{{ hint }}</span><slot v-else /></div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ hint?: string }>()
</script>

<style scoped>
.scene-config-preview { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 12px; min-width: 0; width: 100%; box-sizing: border-box; max-height: min(180px, 26dvh); margin-top: 16px; padding-top: 12px; overflow-x: hidden; overflow-y: auto; color: var(--jet-theme-text, #1d2129); background: var(--jet-theme-bg-container, #fff); border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); font-size: 14px; line-height: 28px; overscroll-behavior: contain; }
.scene-config-preview__label { max-width: 8em; color: var(--jet-theme-text-secondary, #595959); }
.scene-config-preview__content { min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; word-break: normal; }
.scene-config-preview__hint { color: var(--jet-theme-text-secondary, #595959); }
.scene-config-preview:focus-visible { outline: 2px solid var(--jet-theme-primary, #1677ff); outline-offset: 2px; }
</style>
