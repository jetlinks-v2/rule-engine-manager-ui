<template>
  <section class="scene-rule-preview">
    <header class="scene-rule-preview__title">
      <AIcon type="EyeOutlined" />
      <span>{{ $t('IotSceneLinkage.title.rulePreview') }}</span>
      <span class="scene-rule-preview__extra"><slot name="extra" /></span>
    </header>
    <div class="scene-rule-preview__content" tabindex="0" role="region" :aria-label="$t('IotSceneLinkage.title.rulePreview')">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// 规则内容由快速、详细模式各自维护；本组件只统一预览卡片的视觉承载。
const { t: $t } = useI18n()
</script>

<style scoped>
.scene-rule-preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding: var(--space-3, 12px) var(--space-4, 16px);
  /* 使用明确的浅灰底色，避免主题 fill token 与白色容器无可见差异。 */
  background: #fafbfc;
  border: 1px solid var(--scene-editor-section-border, var(--jet-theme-border));
  border-radius: var(--radius-jet-sm, 8px);
}

.scene-rule-preview__title {
  display: flex;
  flex: none;
  gap: var(--space-2, 8px);
  align-items: center;
  margin-bottom: var(--space-2, 8px);
  color: var(--jet-theme-text-secondary, #595959);
  font-size: .875rem;
  font-weight: 600;
  line-height: 1.5rem;
}

.scene-rule-preview__content {
  display: grid;
  align-content: start;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.scene-rule-preview__content:focus-visible { outline: 2px solid var(--jet-theme-primary, #1677ff); outline-offset: 2px; }
.scene-rule-preview__extra { margin-left: auto; }
</style>
