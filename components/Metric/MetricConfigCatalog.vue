<template>
  <section class="config-catalog">
    <label class="config-catalog__search"><AIcon type="SearchOutlined" /><input v-model="keyword" type="search" :placeholder="t('configSearchTemplates')" :aria-label="t('configSearchTemplates')" /></label>
    <nav v-if="categories.length" class="config-catalog__categories" :aria-label="t('templateCategory')"><button type="button" :aria-pressed="!category" @click="category = ''">{{ t('allCategories') }}</button><button v-for="item in categories" :key="item.value" type="button" :aria-pressed="category === item.value" @click="category = item.value">{{ item.label }}</button></nav>
    <div class="config-catalog__items">
      <button v-for="item in visible" :key="templateKey(item.template)" type="button" @click="emit('select', templateKey(item.template))">
        <header><AIcon type="PartitionOutlined" /><b>{{ item.template.name }}</b><small>v{{ item.template.version }}</small></header>
        <p v-if="item.template.options?.description">{{ item.template.options.description }}</p>
        <TemplateOverview :template="item.template" />
        <footer><span>{{ t('configInputCount', { count:item.template.inputDefinitions.length }) }}</span><span>{{ item.template.outputs.map(output => metricOutputName(output, item.template)).join(' · ') }}</span><AIcon type="ArrowRightOutlined" /></footer>
      </button>
    </div>
    <a-empty v-if="!visible.length" :description="t('noTemplate')" />
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateOverview from './template/TemplateOverview.vue'
import { metricMessages } from './messages'
import { templateKey } from './service'
import { metricOutputName } from './presentation'
import type { MetricTemplateCategory, MetricTemplateEntity } from './types'
const props = defineProps<{ templates:MetricTemplateEntity[]; categories:MetricTemplateCategory[] }>()
const emit = defineEmits<{ (event:'select', key:string):void }>()
const { t } = useI18n({ useScope:'local', messages:metricMessages })
const keyword = ref(''), category = ref('')
const visible = computed(() => props.templates.filter(item => (!category.value || item.template.options?.category === category.value)
  && `${item.template.name} ${item.template.options?.description || ''} ${item.template.outputs.map(output => metricOutputName(output, item.template)).join(' ')}`.toLowerCase().includes(keyword.value.trim().toLowerCase())))
</script>
<style scoped>
.config-catalog { display:grid; align-content:start; gap:16px; min-width:0; overflow:auto; padding:0 2px 16px }
.config-catalog__search { display:flex; gap:8px; align-items:center; min-height:36px; border-bottom:1px solid var(--line); color:var(--ink-3) }
.config-catalog__search input { flex:1; width:100%; border:0; background:transparent; color:var(--ink-1); outline:0 }
.config-catalog__search:focus-within { border-color:var(--accent) }
.config-catalog__categories { display:flex; flex-wrap:wrap; gap:8px }
.config-catalog__categories button { border:0; background:var(--bg-sunken); color:var(--ink-2); border-radius:var(--r-2,6px); padding:4px 10px; cursor:pointer }
.config-catalog__categories button[aria-pressed=true] { color:var(--accent); background:var(--accent-soft) }
.config-catalog__items { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px }
.config-catalog__items>button { display:flex; flex-direction:column; gap:8px; min-width:0; border:1px solid var(--line); background:var(--panel-background); color:var(--ink-1); padding:14px; border-radius:var(--r-3,8px); text-align:left; cursor:pointer }
.config-catalog__items>button:hover,.config-catalog__items>button:focus-visible { border-color:var(--accent); outline:0 }
.config-catalog__items header,.config-catalog__items footer { display:flex; gap:8px; align-items:center; min-width:0 }
.config-catalog__items header b { flex:1; min-width:0; overflow-wrap:anywhere; font-weight:500 }
.config-catalog__items header>.anticon { color:var(--accent) }
.config-catalog__items p { margin:0; color:var(--ink-3); font-size:12px; line-height:1.7 }
.config-catalog__items small,.config-catalog__items footer { font-size:11px; color:var(--ink-3) }
.config-catalog__items footer { margin-top:auto; line-height:1.6 }
.config-catalog__items footer>span:nth-child(2) { flex:1; min-width:0; overflow-wrap:anywhere }
.config-catalog__items :deep(.template-overview) { height:130px; pointer-events:none }
@media(max-width:600px) { .config-catalog__items { grid-template-columns:minmax(0,1fr) } }
</style>
