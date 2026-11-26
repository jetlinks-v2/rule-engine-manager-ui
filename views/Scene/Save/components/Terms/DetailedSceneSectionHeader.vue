<template>
  <div :class="['detailed-scene-section-header', headerClass]">
    <span :class="['detailed-scene-section-header__icon', iconClass]">
      <AIcon :type="content.icon" />
    </span>
    <div class="detailed-scene-section-header__copy">
      <strong>{{ $t(content.title) }}</strong>
      <small>{{ $t(content.description) }}</small>
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
  grid-template-columns: 1.75rem max-content minmax(0, 1fr) auto;
  gap: var(--space-3, 12px);
  align-items: flex-start;
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background: #fafbfc;
  border-bottom: 1px solid var(--ant-color-border-secondary);
}
.detailed-scene-section-header__icon {
  display: grid;
  grid-column: 1;
  grid-row: 1;
  width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border-radius: var(--radius-jet-sm, 6px);
}
.detailed-scene-section-header__copy {
  display: grid;
  grid-column: 2;
  grid-row: 1;
  gap: 2px;
  min-width: 0;
}
.detailed-scene-section-header__actions {
  display: flex;
  grid-column: 4;
  grid-row: 1;
  align-items: center;
  justify-self: end;
}
.detailed-scene-section-header strong {
  color: var(--ant-color-text);
  font-size: .875rem;
  font-weight: 600;
  line-height: 1.25rem;
}
.detailed-scene-section-header small {
  color: var(--ant-color-text-tertiary);
  font-size: .75rem;
  line-height: 1.125rem;
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
</style>
