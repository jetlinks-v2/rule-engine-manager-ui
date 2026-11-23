<template>
  <span ref="root" class="sample-value" :inert="disabled || undefined" :title="hint">
    <a-popover v-if="labels.length && !raw" v-model:open="open" trigger="click" placement="bottomLeft" :overlay-style="{ maxWidth:'min(320px,90vw)' }">
      <template #content><div class="sample-value__options" :aria-label="t('semanticStateOptions')"><button v-for="(item,index) in labels" :key="index" type="button" :disabled="disabled" :aria-pressed="value === item.value" @click="select(item)"><IconValueView v-if="item.icon" :value="item.icon" :size="16" :fallback-text="name(item)" /><AIcon v-else :type="value === item.value ? 'CheckCircleOutlined' : 'MinusCircleOutlined'" /><span>{{ name(item) }}<small>{{ String(item.value) }}</small></span></button><button type="button" :disabled="disabled" @click="editRaw"><AIcon type="EditOutlined" /><span>{{ t('semanticOtherValue') }}<small>{{ t('semanticStateHint') }}</small></span></button></div></template>
      <button class="sample-value__state" type="button" :disabled="disabled" :class="{ unknown }" :aria-label="`${input.name || input.id} · ${text}`"><IconValueView v-if="appearance.icon" :value="appearance.icon" :size="14" :fallback-text="text" /><AIcon v-else :type="unknown ? 'QuestionCircleOutlined' : 'CheckCircleOutlined'" /><span class="sample-value__state-name">{{ text }}</span><small v-if="!unknown && value != null">{{ String(value) }}</small><AIcon type="DownOutlined" /></button>
    </a-popover>
    <a-popover v-else-if="input.valueType?.type === 'date'" v-model:open="open" trigger="click" placement="bottomLeft">
      <template #content><div class="sample-value__date-editor"><MetricParameterValue :parameter="{ ...input, valueType:{ ...input.valueType, type:'date' } }" :disabled="disabled" :model-value="value" @update:model-value="commit($event)" /></div></template>
      <button type="button" class="sample-value__date" :disabled="disabled" :title="text" :aria-label="`${input.name || input.id} · ${text}`" :aria-expanded="open"><AIcon type="CalendarOutlined" /><span>{{ text }}</span></button>
    </a-popover>
    <Editable v-else-if="simple || raw" ref="editable" :value="value" :type="type" :component-props="{ disabled, bordered:false, controls:false, placeholder:t('fillSampleValue'), 'aria-label':`${input.name || input.id} · ${t('sampleValue')}` }" @change="commit" />
    <Editable v-else-if="input.valueType?.type === 'boolean'" ref="editable" type="select" :value="value == null ? undefined : String(value)" :component-props="{ disabled, bordered:false, defaultOpen:true, placeholder:t('fillSampleValue'), 'aria-label':`${input.name || input.id} · ${t('sampleValue')}`, options:booleanOptions, dropdownMatchSelectWidth:false }" @change="emit('change', $event === undefined ? null : $event === 'true')" />
    <MetricParameterValue v-else :parameter="{ ...input, valueType:{ ...input.valueType, type:String(input.valueType?.type) } }" :disabled="disabled" :model-value="value" @update:model-value="emit('change', $event ?? null)" />
    <button v-if="raw && labels.length" type="button" class="sample-value__return" :disabled="disabled" :aria-label="t('semanticStateOptions')" @click="raw = false; open = true"><AIcon type="UnorderedListOutlined" /></button>
    <small v-if="showHint" class="sample-value__hint">{{ hint }}</small>
  </span>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import IconValueView from '@jetlinks-web-core/components/IconValue/IconValueView.vue'
import { stateAppearance } from '@jetlinks-web-core/components/Metric/stateIntervals'
import MetricParameterValue from '@jetlinks-web-core/components/Metric/MetricParameterValue.vue'
import { metricMessages } from '@jetlinks-web-core/components/Metric/messages'
import type { MetricTemplate, MetricTemplateInput } from '@jetlinks-web-core/components/Metric/types'
import { useSampleValue } from './useSampleValue'
const props = defineProps<{ input:MetricTemplateInput; value:unknown; template?:MetricTemplate; disabled?:boolean; showHint?:boolean }>()
const emit = defineEmits<{ (event:'change', value:unknown):void }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
const { root, editable, labels, text, unknown, type, hint, name, open, raw, select, commit, edit, editRaw } = useSampleValue(props,() => String(locale.value),t,value => emit('change',value))
const simple = computed(() => !['boolean','object','array','enum','date'].includes(String(props.input.valueType?.type)))
const appearance = computed(() => stateAppearance(props.value,labels.value))
const booleanOptions = computed(() => [{ value:'true', label:t('conditionTrue'), icon:'CheckCircleOutlined', description:'true' }, { value:'false', label:t('conditionFalse'), icon:'CloseCircleOutlined', description:'false' }])
defineExpose({ edit })
</script>
<style scoped>
.sample-value { display:inline-flex; align-items:baseline; flex-wrap:wrap; gap:4px; min-width:40px; max-width:100%; color:var(--accent); font-size:13px }
.sample-value__hint { color:var(--ink-3); font-size:10px; overflow-wrap:anywhere }
.sample-value__return { padding:0 2px; border:0; background:none; color:var(--ink-3); cursor:pointer }
.sample-value :deep(.editable-field) { min-width:40px; max-width:130px }
.sample-value :deep(.ant-input-number),.sample-value :deep(.ant-select) { min-width:70px; max-width:130px }
.sample-value__state,.sample-value__date { display:inline-flex; align-items:center; gap:4px; min-width:0; max-width:100%; border:0; border-radius:4px; padding:1px 4px; background:var(--accent-soft); color:var(--accent); cursor:pointer; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.sample-value__date { background:transparent }
.sample-value__date > span { overflow:hidden; text-overflow:ellipsis }
.sample-value__date :deep(.anticon) { flex:none }
.sample-value__date-editor { width:248px; max-width:calc(100vw - 56px) }
.sample-value__state small { color:var(--ink-3); font-size:10px }
.sample-value__state-name { min-width:0; overflow:hidden; text-overflow:ellipsis }
.sample-value__state > :not(.sample-value__state-name) { flex:none }
.sample-value__state.unknown { color:var(--warning,#ad7e14); background:var(--bg-sunken) }
.sample-value__options { display:grid; gap:2px; max-height:300px; overflow:auto }
.sample-value__options button { display:flex; align-items:center; gap:8px; width:100%; padding:7px 8px; border:0; border-radius:4px; background:transparent; text-align:left; cursor:pointer; color:var(--ink-2) }
.sample-value__options button[aria-pressed=true],.sample-value__options button:hover { background:var(--accent-soft); color:var(--accent) }
.sample-value__options small { display:block; color:var(--ink-3); font-size:11px; line-height:1.6 }
.sample-value button:focus-visible { outline:2px solid var(--accent) }
</style>
