<template>
  <div class="rule-template-diagram" :class="{'rule-template-diagram--compact':compact}">
    <div v-if="!compact && source" class="rule-template-diagram__tools"><a-button type="text" size="small" :aria-label="t('RuleTemplates.zoomOut')" :disabled="zoom<=1" @click="zoom=Math.max(1,zoom-0.5)"><AIcon type="ZoomOutOutlined" /></a-button><a-button type="text" size="small" :aria-label="t('RuleTemplates.zoomIn')" :disabled="zoom>=3" @click="zoom=Math.min(3,zoom+0.5)"><AIcon type="ZoomInOutlined" /></a-button><a-button type="text" size="small" @click="zoom=1">{{t('RuleTemplates.fitDiagram')}}</a-button></div>
    <div class="rule-template-diagram__viewport" :tabindex="compact ? undefined : 0" :aria-label="label">
    <img v-if="source" :src="source" :alt="label" :style="compact ? undefined : {width:`${zoom*100}%`}" decoding="async" />
    <a-empty v-else :description="t('RuleTemplates.blankShortcut')" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
    </div>
  </div>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {Empty} from 'ant-design-vue'
import {localizedTemplateIllustration,type TemplateIllustration} from './illustrations'
const props=defineProps<{illustration:TemplateIllustration;label:string;compact?:boolean}>()
const {t}=useI18n()
const zoom=ref(1)
const source=computed(()=>{
  const svg=localizedTemplateIllustration(props.illustration,t)
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : ''
})
</script>
<style scoped>
.rule-template-diagram{min-width:0;max-width:100%;border:1px solid var(--line);border-radius:var(--r-2,6px)}
.rule-template-diagram__tools{display:flex;justify-content:flex-end;align-items:center;padding:4px;gap:4px;border-bottom:1px solid var(--line)}
.rule-template-diagram__viewport{overflow:auto;max-height:340px;scrollbar-gutter:stable}
.rule-template-diagram img{display:block;max-width:none;height:auto}.rule-template-diagram__viewport:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.rule-template-diagram--compact{overflow:hidden;border:0;height:130px;pointer-events:none}
.rule-template-diagram--compact .rule-template-diagram__viewport{height:100%;overflow:hidden}
.rule-template-diagram--compact img{width:100%;height:100%;max-width:100%;object-fit:contain}
</style>
