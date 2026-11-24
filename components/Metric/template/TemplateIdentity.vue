<template>
  <header class="template-identity">
    <div class="template-identity__icon">
      <IconLibrary v-if="!disabled" :type="icon" :z-index="1200" :label="t('chooseIcon')" @update:type="setIcon" />
      <AIcon v-else :type="icon" />
    </div>
    <div class="template-identity__body">
      <h3><I18nTextEditable :value="template.name" field="name" :label="t('name')" :i18n-messages="templateMessages(template)" :disabled="disabled" @change="setName" /></h3>
      <div class="template-identity__metadata">
        <span v-for="field in fields" :key="field.key" :aria-label="field.label" :title="field.label"><AIcon :type="field.icon" />
          <InputEditable :class="`template-identity__${field.key}`" :value="template[field.key]" :placeholder="field.label" :disabled="disabled || published" size="small" @update:value="setField(field.key, $event)" />
        </span>
        <a-tag v-if="published" color="blue">{{ t('published') }} · r{{ revision || 1 }}</a-tag>
        <a-tag v-if="pending">{{ t('pendingChanges') }}</a-tag>
      </div>
    </div>
  </header>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import IconLibrary from '@jetlinks-web-core/components/IconLibrary/index.vue'
import InputEditable from '@jetlinks-web-core/components/Editable/InputEditable.vue'
import I18nTextEditable from '@jetlinks-web-core/components/I18n/I18nTextEditable.vue'
import { templateMessages } from './text'
import { metricMessages } from '../messages'
import type { MetricTemplate } from '../types'
const props = defineProps<{ template: MetricTemplate; disabled?: boolean; published?: boolean; revision?: number; pending?: boolean }>()
const emit = defineEmits<{ (event: 'update:template', value: MetricTemplate): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const icon = computed(() => typeof props.template.options?.icon === 'string' ? props.template.options.icon : 'FunctionOutlined')
const fields = computed(() => [{ key: 'id' as const, label: t('templateId'), icon: 'NumberOutlined' }, { key: 'version' as const, label: t('version'), icon: 'BranchesOutlined' }])
function setName(value: { value: string; i18nMessages: Record<string, Record<string, string>> }) {
  if (!props.disabled) emit('update:template', { ...props.template, name: value.value, options: { ...props.template.options, i18nMessages: value.i18nMessages } })
}
function setIcon(value: string) { if (!props.disabled) emit('update:template', { ...props.template, options: { ...props.template.options, icon: value } }) }
function setField(field: 'id' | 'version', value: string) { if (!props.disabled && !props.published) emit('update:template', { ...props.template, [field]: value }) }
</script>
<style scoped>
.template-identity { display:flex; align-items:center; gap:var(--space-3,12px); min-width:0 }
.template-identity__icon { display:flex; align-items:center; justify-content:center; flex-shrink:0; width:42px; height:42px; border:1px solid var(--line); border-radius:var(--r-2,6px); background:var(--bg-sunken); font-size:20px; color:var(--accent) }
.template-identity__icon :deep(.container) { width:100%; height:100%; border:0; background:transparent }
.template-identity__icon :deep(.icon-display) { font-size:20px }
.template-identity__body { min-width:0; flex:1 }
.template-identity h3 { height:32px; margin:0 0 4px; font-size:var(--fs-18,18px); font-weight:600; line-height:32px }
.template-identity h3 :deep(.j-ellipsis) { font-size:inherit; line-height:1.4 }
.template-identity__metadata { display:flex; align-items:center; gap:var(--space-3,12px); flex-wrap:wrap; color:var(--ink-3); font-size:12px }
.template-identity__metadata>span { display:inline-flex; align-items:center; gap:6px; min-width:0; max-width:100%; height:24px }
.template-identity__metadata :deep(.j-ellipsis) { font-size:inherit }
.template-identity__id { width:160px; max-width:100% }
.template-identity__version { width:72px; max-width:100% }
.template-identity__metadata :deep(.ant-btn) { opacity:0 }
.template-identity__metadata>span:hover :deep(.ant-btn),.template-identity__metadata>span:focus-within :deep(.ant-btn) { opacity:1 }
.template-identity__metadata :deep(.ant-tag) { margin:0 }
@media(hover:none) { .template-identity__metadata :deep(.ant-btn) { opacity:1 } }
</style>
