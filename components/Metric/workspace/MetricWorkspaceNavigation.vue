<template>
  <section class="metric-navigation">
    <div class="metric-navigation__heading">
      <AIcon class="metric-navigation__icon" :type="dimension?.provider.icon || 'AppstoreOutlined'" aria-hidden="true" />
      <a-select class="metric-navigation__dimension" :value="selection?.ownerType" :placeholder="t('chooseDimension')" :aria-label="t('chooseDimension')" :bordered="false" :dropdown-match-select-width="false" option-label-prop="label" @update:value="(value: unknown) => emit('dimension', String(value))">
        <a-select-option v-for="item in dimensions" :key="item.provider.ownerType" :value="item.provider.ownerType" :label="resourceLabel(item.provider.label)"><SelectOption :label="resourceLabel(item.provider.label)" :icon="item.provider.icon || 'AppstoreOutlined'" /></a-select-option>
        <template #suffixIcon><AIcon type="DownOutlined" /></template>
      </a-select>
    </div>
    <div class="metric-navigation__objects">
      <component :is="dimension.provider.navigator" v-if="dimension" :key="JSON.stringify([scopeKey, dimension.moduleId, dimension.provider.ownerType])" :selected-id="selection?.ownerId || undefined" @select="(value?: MetricObjectSelection, origin?: MetricSelectionOrigin) => emit('select', value, origin)" />
      <a-empty v-else :description="dimensions.length ? t('chooseDimension') : t('noDimensions')" />
    </div>
  </section>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import { metricMessages } from '../messages'
import type { RegisteredMetricDimension } from '../extensions/registry'
import type { MetricLabel, MetricObjectSelection, MetricSelectionOrigin, MetricWorkspaceSelection } from '../types'
defineProps<{ scopeKey: string; dimensions: RegisteredMetricDimension[]; dimension?: RegisteredMetricDimension; selection?: MetricWorkspaceSelection }>()
const emit = defineEmits<{ (event: 'dimension', value: string): void; (event: 'select', value?: MetricObjectSelection, origin?: MetricSelectionOrigin): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const resourceLabel = (label: MetricLabel) => typeof label === 'function' ? label() : label
</script>
<style scoped>
.metric-navigation { height:100%; min-height:0; display:flex; flex-direction:column; gap:var(--space-3,12px) }
.metric-navigation__heading { position:relative; flex:none }
.metric-navigation__icon { position:absolute; inset-inline-start:8px; top:50%; transform:translateY(-50%); color:var(--accent); font-size:16px; pointer-events:none }
.metric-navigation__dimension { flex:none; width:100%; min-height:36px; font-weight:600 }
.metric-navigation__dimension :deep(.ant-select-selector) { padding-inline:32px 8px !important }
.metric-navigation__objects { flex:1; min-height:0; overflow:hidden }
.metric-navigation__objects > :deep(*) { height:100% }
</style>
