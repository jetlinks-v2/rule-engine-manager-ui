<template>
  <article class="metric-parameter" :data-parameter="parameter.id">
    <header class="metric-parameter__head">
      <AIcon :type="icon" />
      <div class="metric-parameter__name"><slot name="name">{{ parameter.name || parameter.id }}</slot></div>
      <span class="metric-parameter__type"><slot name="type">{{ t(parameterTypeKeys[parameter.valueType?.type || 'string'] || 'parameterText') }}</slot></span>
      <slot name="actions" />
      <button ref="toggleButton" type="button" class="metric-parameter__toggle" :aria-expanded="expanded" :aria-controls="bodyId" :aria-label="t(expanded ? 'parameterCollapse' : 'parameterExpand', { name:parameter.name || parameter.id })" @click="toggle"><AIcon :type="expanded ? 'UpOutlined' : 'DownOutlined'" /></button>
    </header>
    <div class="metric-parameter__meta"><div v-show="expanded" class="metric-parameter__id"><slot name="identifier"><code>{{ parameter.id }}</code></slot></div><button v-if="!expanded" type="button" class="metric-parameter__summary" :title="summary" :aria-controls="bodyId" :aria-expanded="false" @click="toggle">{{ summary }}<span v-if="value != null && value !== '' && parameter.valueType?.unit"> {{ parameter.valueType.unit }}</span></button><slot name="state" /></div>
    <div v-show="expanded" :id="bodyId" class="metric-parameter__body">
    <div v-if="$slots.description || parameter.description" class="metric-parameter__description"><slot name="description">{{ parameter.description }}</slot></div>
    <div class="metric-parameter__value"><span>{{ valueLabel }}</span><MetricParameterValue inline :parameter="parameter" :model-value="value" :disabled="disabled" @update:model-value="emit('change', $event)" /><span v-if="parameter.valueType?.unit">{{ parameter.valueType.unit }}</span></div>
    <p v-if="numericParameter(parameter) || parameter.valueType?.type === 'enum'" class="metric-parameter__constraint">{{ constraint }}</p>
    <div v-if="range" class="metric-parameter__range" role="img" :aria-label="constraint">
      <div class="metric-parameter__track"><i v-if="range.position !== undefined" :style="{ left:`${range.position}%` }" /></div>
      <div class="metric-parameter__ticks"><span>{{ range.min }}</span><span>{{ range.max }}</span></div>
    </div>
    <slot />
    </div>
  </article>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricParameterValue from './MetricParameterValue.vue'
import { numericParameter, parameterConstraints, parameterRange, parameterTypeKeys, parameterValueText } from './parameterPresentation'
import { metricMessages } from './messages'
import type { MetricParameter } from './types'
const props = withDefaults(defineProps<{ parameter: MetricParameter; value: unknown; valueLabel: string; disabled?: boolean; expanded?: boolean }>(), { expanded:true })
const emit = defineEmits<{ (event:'change', value:unknown):void; (event:'toggle'):void }>()
const { t } = useI18n({ useScope:'local', messages:metricMessages })
const bodyId = `metric-parameter-${useId()}`
const toggleButton = ref<HTMLButtonElement>()
function toggle() { emit('toggle'); nextTick(() => toggleButton.value?.focus({ preventScroll:true })) }
const constraint = computed(() => parameterConstraints(props.parameter, t))
const range = computed(() => parameterRange(props.parameter, props.value))
const summary = computed(() => parameterValueText(props.parameter, props.value, t))
const icon = computed(() => numericParameter(props.parameter) ? 'NumberOutlined' : props.parameter.valueType?.type === 'boolean' ? 'PoweroffOutlined' : props.parameter.valueType?.type === 'enum' ? 'UnorderedListOutlined' : 'FontSizeOutlined')
</script>
<style scoped>
.metric-parameter { min-width:0; border:1px solid var(--line); border-radius:var(--r-3,8px); padding:12px; font-size:13px; overflow-wrap:anywhere }
.metric-parameter__head { display:flex; align-items:center; gap:6px; min-height:32px }
.metric-parameter__head > :first-child { flex:none; color:var(--ink-3) }
.metric-parameter__name { min-width:0; flex:1; font-weight:500 }
.metric-parameter__name > :deep(*) { max-width:100% }
.metric-parameter__toggle { flex:none; display:grid; place-items:center; width:24px; height:28px; padding:0; border:0; background:transparent; color:var(--ink-3); cursor:pointer }
.metric-parameter__toggle:focus-visible,.metric-parameter__summary:focus-visible { outline:1px solid var(--accent); border-radius:4px }
.metric-parameter__summary { flex:1; min-width:0; text-align:left; border:0; background:transparent; color:var(--accent); font:inherit; padding:0; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.metric-parameter__summary > span { margin-left:4px }
.metric-parameter__body { min-width:0 }
.metric-parameter__type { flex:none; color:var(--ink-3); font-size:11px; font-weight:400 }
.metric-parameter__type :deep(.editable-field) { min-width:28px }
.metric-parameter__meta { display:flex; align-items:center; gap:8px; min-height:24px; color:var(--ink-3); font-size:12px }
.metric-parameter__id { flex:1; min-width:0; font-size:11px; overflow-wrap:anywhere; font-family:monospace }
.metric-parameter__id :deep(.editable-field) { width:100%; height:24px }
.metric-parameter__id :deep(.text) { height:24px; line-height:24px; padding:0 }
.metric-parameter__description { color:var(--ink-3); line-height:1.7; margin:4px 0 }
.metric-parameter__value { display:flex; align-items:center; gap:4px; min-height:40px }
.metric-parameter__value > span { flex:none }
.metric-parameter__value > :deep(.metric-parameter-value) { flex:0 1 auto; min-width:64px; max-width:100%; color:var(--accent) }
.metric-parameter__constraint { color:var(--ink-3); font-size:12px; line-height:1.7; margin:2px 0 0 }
.metric-parameter__range { padding-top:10px; margin:0 4px }
.metric-parameter__track { height:3px; position:relative; border-radius:4px; background:var(--line) }
.metric-parameter__track i { position:absolute; width:7px; height:7px; top:-2px; border-radius:50%; background:var(--accent); transform:translateX(-50%) }
.metric-parameter__ticks { display:flex; justify-content:space-between; margin-top:6px; font-size:11px; color:var(--ink-3) }
</style>
