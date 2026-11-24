<template>
  <div class="template-catalog-grid" :class="{ 'template-catalog-grid--flat':flat }">
  <section v-for="group in groups" :key="group.id" class="template-catalog">
    <h3 v-if="group.label && !flat">{{ group.label }}</h3>
    <div class="template-catalog__items">
      <button v-for="item in group.items" :key="item.kind === 'template' ? item.entity.id : JSON.stringify([item.starter.providerId,item.starter.id,item.template.version])" type="button" class="template-catalog__item" :aria-label="item.template.name" @click="emit('select', item)">
        <span class="template-catalog__heading">
          <AIcon :type="item.icon" class="template-catalog__icon" />
          <b>{{ item.template.name }}</b>
          <a-tag v-if="item.kind === 'template'" :color="item.entity.released ? 'blue' : undefined">{{ t(item.entity.released ? 'published' : 'draft') }}</a-tag>
          <a-tag v-else>{{ item.starter.providerName || t('builtinExamples') }}</a-tag>
          <AIcon type="ArrowRightOutlined" class="template-catalog__open" />
        </span>
        <span class="template-catalog__description">{{ item.template.options?.description }}</span>
        <span class="template-catalog__overview"><TemplateOverview :template="item.template" /></span>
        <span v-if="item.kind === 'starter' && item.starter.industries?.length" class="template-catalog__metadata"><span v-for="industry in item.starter.industries" :key="industry.id">{{ industry.name }}</span></span>
        <span v-if="item.kind === 'template'" class="template-catalog__metadata">
          <span v-if="flat">{{ group.label }}</span>
          <span>{{ t('version') }} {{ item.template.version }}</span>
          <span v-if="reference && item.entity.revision">{{ t('referenceRevision', {revision:item.entity.revision}) }}</span>
          <span v-else-if="!reference && item.entity.draft">{{ t('pendingChanges') }}</span>
          <span v-if="!item.entity.available">{{ t('notSelectable') }}</span>
        </span>
      </button>
    </div>
  </section>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { metricMessages } from '../messages'
import type { TemplateCatalogGroup, TemplateCatalogItem } from './templateCatalog'
import TemplateOverview from './TemplateOverview.vue'
defineProps<{ groups: TemplateCatalogGroup[]; flat?: boolean; reference?:boolean }>()
const emit = defineEmits<{ (event: 'select', item: TemplateCatalogItem): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
</script>
<style scoped>
.template-catalog { margin-bottom:var(--space-5,20px) }
.template-catalog-grid--flat { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr)); gap:var(--space-4,16px) }
.template-catalog-grid--flat .template-catalog, .template-catalog-grid--flat .template-catalog__items { display:contents }
.template-catalog h3 { margin:0 0 var(--space-3,12px); color:var(--ink-2); font-size:var(--fs-14,14px); font-weight:500 }
.template-catalog__items { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr)); gap:var(--space-4,16px) }
.template-catalog__item { display:flex; flex-direction:column; align-items:stretch; gap:var(--space-3,12px); min-width:0; padding:var(--space-4,16px); border:1px solid var(--line); border-radius:var(--r-2,6px); background:var(--panel-background,#fff); color:var(--ink-1); text-align:left; font:inherit; cursor:pointer }
.template-catalog__item:hover { border-color:var(--accent); background:var(--accent-soft) }
.template-catalog__item:focus-visible { outline:2px solid var(--accent); outline-offset:2px }
.template-catalog__heading { display:flex; align-items:center; gap:var(--space-2,8px); min-width:0 }
.template-catalog__heading b { flex:1; min-width:0; font-size:var(--fs-14,14px); font-weight:500; line-height:24px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.template-catalog__heading :deep(.ant-tag) { flex:none; max-width:40%; overflow:hidden; text-overflow:ellipsis; margin:0; border:0; font-size:11px }
.template-catalog__icon { flex:none; color:var(--accent); font-size:18px }
.template-catalog__open { flex:none; color:var(--ink-4); font-size:12px }
.template-catalog__description { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:3.2em; color:var(--ink-3); font-size:var(--fs-12,12px); line-height:1.6; overflow-wrap:anywhere }
.template-catalog__overview { display:block; height:160px; margin-top:auto; padding-top:var(--space-3,12px); pointer-events:none }
.template-catalog__metadata { display:flex; flex-wrap:wrap; gap:var(--space-3,12px); color:var(--ink-3); font-size:var(--fs-12,12px); line-height:1.5 }
</style>
