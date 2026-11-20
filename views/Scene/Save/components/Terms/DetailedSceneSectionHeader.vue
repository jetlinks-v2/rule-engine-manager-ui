<template>
  <div :class="['detailed-scene-section-header', headerClass]">
    <span :class="['detailed-scene-section-header__icon', iconClass]">
      <AIcon :type="content.icon" />
    </span>
    <div class="detailed-scene-section-header__copy">
      <strong>{{ $t(content.title) }}</strong>
      <a-tooltip :title="$t(content.description)">
        <button type="button" class="detailed-scene-section-header__help" :aria-label="$t(content.description)">
          <AIcon type="QuestionCircleOutlined" />
        </button>
      </a-tooltip>
    </div>
    <span v-if="$slots.actions" class="detailed-scene-section-header__actions">
      <slot name="actions" />
    </span>
    <span v-if="$slots.extra" class="detailed-scene-section-header__extra">
      <slot name="extra" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ kind: 'condition' | 'otherwise' | 'action' }>()

const headers = {
  condition: { icon: 'FilterOutlined', title: 'IotSceneLinkage.detail.conditionTitle', description: 'IotSceneLinkage.detail.conditionDescription' },
  otherwise: { icon: 'ApartmentOutlined', title: 'IotSceneLinkage.detail.otherwiseTitle', description: 'IotSceneLinkage.detail.otherwiseDescription' },
  action: { icon: 'PlayCircleOutlined', title: 'IotSceneLinkage.detail.executeActionTitle', description: 'IotSceneLinkage.detail.executeActionDescription' },
}
const content = computed(() => headers[props.kind])
const headerClass = computed(() => props.kind === 'action' ? 'detailed-scene-action-card__header' : 'detailed-scene-branch-card__header')
const iconClass = computed(() => props.kind === 'action' ? 'detailed-scene-action-card__icon' : 'detailed-scene-branch-card__icon')
</script>

<style scoped>
.detailed-scene-section-header {
  display: grid;
  grid-template-columns: 1rem max-content minmax(0, 1fr) auto;
  column-gap: var(--space-2, 8px);
  row-gap: var(--space-2, 8px);
  align-items: start;
  min-height: 2rem;
  padding: 0;
}
.detailed-scene-section-header__icon {
  display: grid;
  grid-column: 1;
  grid-row: 1;
  width: 1rem;
  height: 2rem;
  place-items: center;
  color: var(--jet-theme-text-secondary, #595959);
}
.detailed-scene-section-header__copy {
  display: flex;
  grid-column: 2;
  grid-row: 1;
  gap: 4px;
  align-items: center;
  min-width: 0;
  min-height: 2rem;
}
.detailed-scene-section-header__actions {
  display: flex;
  grid-column: 4;
  grid-row: 1;
  align-items: center;
  justify-self: end;
}
.detailed-scene-section-header strong {
  color: var(--jet-theme-text, #1d2129);
  font-size: var(--fs-14, .875rem);
  font-weight: 600;
  line-height: 1.25rem;
}
.detailed-scene-section-header__help {
  display: inline-grid;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  place-items: center;
  color: var(--jet-theme-text-secondary, #595959);
  font-size: var(--fs-14, .875rem);
  background: transparent;
  border: 0;
  border-radius: var(--radius-jet-sm, 4px);
  cursor: pointer;
}
.detailed-scene-section-header__help:hover {
  color: var(--jet-theme-primary, #1677ff);
  background: var(--jet-theme-primary-soft, #e8f0ff);
}
.detailed-scene-section-header__help:focus-visible {
  outline: 2px solid var(--jet-theme-primary, #1677ff);
  outline-offset: 2px;
}
/* 开关紧随标题区，参数在开关右侧展开；开关启闭不改变其自身位置。 */
.detailed-scene-section-header__extra {
  grid-column: 3;
  grid-row: 1;
  min-width: 0;
  align-self: start;
}
.detailed-scene-section-header__extra :deep(.shakeLimit) {
  display: flex;
  align-items: flex-start;
  width: 100%;
  gap: var(--space-3, 12px);
  padding-top: 5px;
}
.detailed-scene-section-header__extra :deep(.shakeLimit > .ant-switch) {
  flex: none;
}
.detailed-scene-section-header__extra :deep(.shakeLimit > .ant-form-item) {
  flex: 1;
  min-width: 0;
}
.detailed-scene-section-header__extra :deep(.shakeLimit:not(.is-enabled) > .ant-form-item) {
  display: none;
}
.detailed-scene-section-header__extra :deep(.shakeLimit__cycle) {
  display: flex;
  flex: 0 0 100%;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
  align-items: center;
}
@media (max-width: 960px) {
  .detailed-scene-section-header__extra :deep(.shakeLimit) {
    flex-wrap: wrap;
  }
  .detailed-scene-section-header__extra :deep(.shakeLimit > .ant-form-item) {
    flex-basis: 100%;
  }
}
</style>
