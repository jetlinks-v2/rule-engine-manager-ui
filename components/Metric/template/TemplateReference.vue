<template>
  <span class="template-reference" :data-reference="metricId" :tabindex="metricId && context ? 0 : undefined"
    @mouseenter="context?.preview(metricId)" @mouseleave="context?.preview()" @focusin="context?.preview(metricId)" @focusout="context?.preview()"
    @keydown.enter.self.stop.prevent="locate">
    <slot />
    <a-button v-if="locatable && metricId && context" type="text" size="small" :aria-label="t('locateReference')" :title="t('locateReference')" @click.stop="locate"><AIcon type="AimOutlined" /></a-button>
  </span>
</template>
<script setup lang="ts">
import { inject, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import { templateReferenceKey } from './templateReference'
const props = defineProps<{ metricId?: string; locatable?: boolean }>()
const context = inject(templateReferenceKey, undefined)
const { t } = useI18n({ useScope:'local', messages:metricMessages })
function locate() { if (props.metricId) context?.locate(props.metricId) }
onBeforeUnmount(() => context?.preview())
</script>
<style scoped>
.template-reference { display:inline-flex; align-items:center; min-width:0; max-width:100%; gap:4px; border-radius:var(--r-2,6px) }
.template-reference:focus-visible { outline:1px dashed var(--accent); outline-offset:2px }
.template-reference > :deep(.ant-btn) { flex:none; width:24px; height:24px; padding:0; color:var(--ink-3) }
</style>
