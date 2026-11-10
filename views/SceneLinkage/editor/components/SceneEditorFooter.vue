<template>
  <span ref="anchor" class="scene-editor-footer-anchor" aria-hidden="true" />
  <Teleport to="body">
    <footer v-if="active && width > 0" class="scene-editor-footer" :style="{ left: `${left}px`, width: `${width}px` }"><slot /></footer>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref } from 'vue'
import { useElementBounding } from '@vueuse/core'

const anchor = ref<HTMLElement>()
const active = ref(true)
// 挂载到 body 避开内容面板的 backdrop-filter，同时跟随编辑容器的真实边界和菜单折叠。
const container = computed(() => anchor.value?.parentElement)
const { left, width, update } = useElementBounding(container)
onActivated(() => { active.value = true; update() })
onDeactivated(() => { active.value = false })
</script>

<style scoped>
.scene-editor-footer-anchor { display: none; }
.scene-editor-footer { position: fixed; bottom: 0; z-index: var(--z-index-popup-base, 100); display: flex; justify-content: flex-end; gap: var(--space-2, 8px); margin: 0; padding: var(--space-3, 12px) var(--space-6, 24px); background: var(--jet-theme-bg-container); border-top: 1px solid var(--scene-editor-section-border, #f0f0f0); box-shadow: 0 -4px 12px rgba(0, 0, 0, .06); box-sizing: border-box; }
@media (max-width: 640px) { .scene-editor-footer { padding-right: var(--space-4, 16px); padding-left: var(--space-4, 16px); } }
</style>
