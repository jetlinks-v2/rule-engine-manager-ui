<template>
  <div class="metric-value-fields" :aria-label="t('semanticFields')">
    <div v-for="field in fields" :key="field.id" class="metric-value-fields__field"><small>{{ field.name }}</small><span>{{ text(field) }}<small v-if="field.unit && !isDuration(field)"> {{ field.unit }}</small></span></div>
    <details><summary>{{ t('semanticRawValue') }}</summary><code>{{ raw }}</code></details>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from './messages'
import { metricDurationText } from './presentation'
import { metricValueFields, schemaValueLabels, semanticValueText, type ValueField, type ValueSchema } from './valueSemantics'
const props = defineProps<{ value:unknown; schema?:ValueSchema }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricMessages })
const fields = computed(() => metricValueFields(props.value,props.schema))
const raw = computed(() => JSON.stringify(props.value,null,2))
const isDuration = (field:ValueField) => metricDurationText(field.value,field.unit,t) !== undefined
const text = (field:ValueField) => semanticValueText(field.value,{ labels:schemaValueLabels(field.schema), locale:String(locale.value), unit:field.unit },t)
</script>
<style scoped>
.metric-value-fields { display:grid; gap:8px; margin-top:12px; min-width:0; font-size:12px }
.metric-value-fields__field { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding-left:10px; border-left:2px solid var(--line); min-width:0 }
.metric-value-fields small { color:var(--ink-3); font-size:11px; overflow-wrap:anywhere }
.metric-value-fields__field>span { color:var(--ink-1); text-align:right; overflow-wrap:anywhere }
.metric-value-fields details { color:var(--ink-3); font-size:11px }
.metric-value-fields summary { cursor:pointer }
.metric-value-fields code { display:block; max-height:240px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; margin-top:8px }
</style>
