<template>
  <span class="calculator-formula">
    <LatexView :latex="formula" :label="description" />
    <a-tooltip v-if="description || symbols?.length" :mouse-enter-delay="0.1">
      <template #title>
        <p v-if="description" class="calculator-formula__description">{{ description }}</p>
        <dl v-if="symbols?.length" class="calculator-formula__symbols"><div v-for="item in symbols" :key="item.symbol"><dt><LatexView :latex="item.symbol" /></dt><dd>{{ item.description }}</dd></div></dl>
      </template>
      <span class="calculator-formula__help" tabindex="0" role="img" :aria-label="t('guideSymbols')" @mousedown.stop.prevent @click.stop><AIcon type="InfoCircleOutlined" /></span>
    </a-tooltip>
  </span>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LatexView from '@jetlinks-web-core/components/Expression/LatexView.vue'
import type { MetricCalculatorDocumentation } from '@jetlinks-web-core/components/Metric/types'
import { algorithmGuideMessages } from './algorithmGuideMessages'
defineProps<{ formula:string; description?:string; symbols?:MetricCalculatorDocumentation['symbols'] }>()
const { t } = useI18n({ useScope:'local', messages:algorithmGuideMessages })
</script>
<style scoped>
.calculator-formula { display:flex; align-items:center; gap:8px; min-width:0; max-width:100% }
.calculator-formula > .latex-view { flex:1; min-width:0 }
.calculator-formula__help { flex:none; display:inline-flex; padding:2px; color:var(--ink-3,var(--jet-theme-text-secondary,#8c8c8c)); cursor:help; border-radius:3px }
.calculator-formula__help:hover,.calculator-formula__help:focus-visible { color:var(--accent,#1677ff); outline:1px solid currentColor }
.calculator-formula__description { margin:0 0 4px; max-width:300px }
.calculator-formula__symbols { margin:0; max-width:300px }
.calculator-formula__symbols > div { display:grid; grid-template-columns:48px minmax(0,1fr); align-items:baseline; gap:8px; padding:3px 0 }
.calculator-formula__symbols dd { margin:0 }
</style>
