<template>
  <div class="ai-event-resource-option">
    <IconValueView
      v-if="option.icon === 'scene'"
      :size="28"
      :fallback-text="sceneInitial"
    />
    <span v-else class="ai-event-resource-option__icon"><component :is="iconComponent" /></span>
    <span class="ai-event-resource-option__content">
      <a-tooltip :title="option.label">
        <span class="ai-event-resource-option__title">{{ option.label }}</span>
      </a-tooltip>
      <a-tooltip v-if="option.description" :title="option.description" placement="right" :overlayStyle="{ pointerEvents: 'none' }">
        <span class="ai-event-resource-option__description">{{ option.description }}</span>
      </a-tooltip>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { AimOutlined, AppstoreOutlined, DeploymentUnitOutlined } from '@ant-design/icons-vue'
import { IconValueView } from '@jetlinks-web-core/components/IconValue'

export type AiEventResourceOption = {
  label: string
  value: string
  description?: string
  icon: string
}

const props = defineProps({
  option: { type: Object as PropType<AiEventResourceOption>, required: true },
})

const iconComponent = computed(() => ({
  AimOutlined,
  DeploymentUnitOutlined,
}[props.option.icon] || AppstoreOutlined))
const sceneInitial = computed(() => [...props.option.label.trim()].slice(0, 1).join(''))
</script>

<style scoped>
.ai-event-resource-option { display: flex; gap: var(--space-2, 8px); align-items: center; min-width: 0; padding: var(--space-1, 4px) 0; }
.ai-event-resource-option__icon { display: grid; flex: none; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-jet-sm, 8px); color: #1e5eff; background: #e8f0ff; font-size: 16px; }
.ai-event-resource-option__content { display: grid; flex: 1; gap: 4px; min-width: 0; line-height: 1.35; }
.ai-event-resource-option__title { display: block; overflow: hidden; color: var(--ant-color-text); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.ai-event-resource-option__description { display: block; overflow: hidden; color: var(--ant-color-text-tertiary, #86909c); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
</style>
