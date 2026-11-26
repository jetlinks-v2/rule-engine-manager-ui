<template>
  <section class="member-statistics">
    <header><b><AIcon type="NodeIndexOutlined" /> {{ t('memberStatistics') }}</b><a-button type="text" size="small" @click="state.close"><AIcon type="ArrowLeftOutlined" />{{ t('back') }}</a-button></header>
    <p class="statistics-scope"><AIcon type="ApartmentOutlined" />{{ scopeLabel }} · {{ t(includeChildren ? 'includeChildren' : 'directMembers') }}</p>
    <a-alert v-if="state.error.value" type="error" :message="t('failed')" show-icon><template #action><a-button type="link" size="small" @click="retry">{{ t('retry') }}</a-button></template></a-alert>
    <a-spin :spinning="state.loading.value">
      <template v-if="state.choosingProduct.value">
        <p>{{ t('statisticsSelectProduct') }}</p>
        <label class="statistics-search"><AIcon type="SearchOutlined" /><input v-model="state.keyword.value" type="search" :placeholder="t('searchProduct')" :aria-label="t('searchProduct')" @input="search" /></label>
        <div class="statistics-options"><button v-for="item in state.products.value" :key="item.id" type="button" @click="state.selectProduct(item.id)"><AIcon type="AppstoreOutlined" /><span><b>{{ item.name }}</b><small>{{ item.id }}</small></span><AIcon type="RightOutlined" /></button></div>
        <a-empty v-if="!state.loading.value && !state.error.value && !state.products.value.length" :description="t('noProducts')" :image-style="{ height:'36px' }" />
        <a-pagination v-if="state.total.value > 20" size="small" :current="state.page.value" :total="state.total.value" :page-size="20" :show-size-changer="false" @change="state.changePage" />
      </template>
      <template v-else>
        <div class="statistics-step">
          <small><AIcon type="AppstoreOutlined" />{{ t('statisticsMembers') }}</small>
          <p>{{ t('statisticsProductPrefix') }}<button type="button" class="statistics-token" @click="state.changeProduct">{{ state.productLabel.value }}<AIcon type="EditOutlined" /></button>{{ t('statisticsProductSuffix') }}</p>
          <p class="statistics-note">{{ t('statisticsProductLimit') }}</p>
        </div>
        <div class="statistics-step">
          <small><AIcon type="DatabaseOutlined" />{{ t('statisticsSource') }}</small>
          <button v-if="state.selected.value" type="button" class="statistics-selected" @click="state.selectedKey.value = ''"><AIcon type="NodeIndexOutlined" /><span><b>{{ outputName(state.selected.value) }}</b><small>{{ state.selected.value.config.name || state.selected.value.template.name }}</small></span><AIcon type="EditOutlined" /></button>
          <template v-else>
            <p class="statistics-note">{{ t('statisticsOutputHint') }}</p>
            <div class="statistics-options"><button v-for="item in state.outputs.value" :key="state.outputKey(item)" type="button" @click="state.selectOutput(item)"><AIcon type="NodeIndexOutlined" /><span><b>{{ outputName(item) }} <em>{{ item.output.unit }}</em></b><small>{{ item.config.name || item.template.name }}</small></span><AIcon type="RightOutlined" /></button></div>
            <a-empty v-if="!state.loading.value && !state.error.value && !state.outputs.value.length" :description="t('statisticsNoOutputs')" :image-style="{ height:'36px' }" />
          </template>
        </div>
        <template v-if="state.selected.value">
          <div class="statistics-step">
            <small><AIcon type="FunctionOutlined" />{{ t('statisticsCalculation') }}</small>
            <p class="statistics-sentence"><Editable type="select" :value="state.spec.value.operation" :component-props="{ options:operations, 'aria-label':t('statisticsCalculation') }" @update:value="state.operation($event as 'count' | 'sum')" />
              <Editable type="select" :value="state.spec.value.operator || 'all'" :component-props="{ options:operators, 'aria-label':t('statisticsCondition') }" @update:value="state.predicate($event === 'all' ? undefined : $event as MetricScopeStatistics['operator'])" />
              <Editable v-if="state.spec.value.operator" :type="valueEditor" :value="state.spec.value.value" :component-props="{ options:booleanValues, 'aria-label':t('statisticsConditionValue') }" @update:value="state.spec.value.value = $event as string | number | boolean" />
            </p>
            <p class="statistics-note">{{ t(state.spec.value.operation === 'count' ? 'statisticsCountHint' : 'statisticsSumHint') }}</p>
          </div>
          <div class="statistics-step">
            <small><AIcon type="CalendarOutlined" />{{ t('statisticsPeriod') }}</small>
            <p class="statistics-sentence"><Editable v-model:value="state.spec.value.period" type="select" :component-props="{ options:periods, 'aria-label':t('statisticsPeriod') }" /></p>
            <template v-if="state.spec.value.period !== 'current'">
              <p class="statistics-sentence">{{ t('statisticsPeriodStart') }}<Editable v-model:value="state.spec.value.periodMetricId" type="select" :component-props="{ options:auxiliaryOptions, placeholder:t('statisticsChooseOutput'), 'aria-label':t('statisticsPeriodStart') }" /></p>
              <p class="statistics-sentence">{{ t('statisticsCoverage') }}<Editable v-model:value="state.spec.value.coverageMetricId" type="select" :component-props="{ options:auxiliaryOptions, placeholder:t('statisticsChooseOutput'), 'aria-label':t('statisticsCoverage') }" /></p>
              <p class="statistics-sentence">{{ t('statisticsZone') }}<Editable v-model:value="state.spec.value.zone" :component-props="{ 'aria-label':t('statisticsZone') }" /></p>
              <p class="statistics-note">{{ t('statisticsPeriodGuard') }}</p>
            </template>
          </div>
          <div class="statistics-step">
            <small><AIcon type="SafetyOutlined" />{{ t('statisticsValidity') }}</small>
            <p class="statistics-sentence">{{ t('statisticsFreshPrefix') }}<Editable v-model:value="state.spec.value.maxAge" type="select" :component-props="{ options:freshness, 'aria-label':t('statisticsValidity') }" />{{ t('statisticsFreshSuffix') }}</p>
            <p class="statistics-note">{{ t('statisticsQualityHint') }}</p>
          </div>
          <p v-for="problem in state.problems.value" :key="problem" class="statistics-warning" role="alert"><AIcon type="InfoCircleOutlined" />{{ t(problem) }}</p>
          <a-button type="primary" block :disabled="!state.canConfirm.value" @click="state.confirm(`${scopeLabel} / ${t('memberStatistics')} / ${outputName(state.selected.value)}`)">{{ t('statisticsUseSource') }}</a-button>
        </template>
      </template>
    </a-spin>
  </section>
</template>
<script setup lang="ts">
import { computed, onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import { localizedTemplate } from '../template/text'
import { metricOutputName } from '../presentation'
import type { MetricScopeStatistics } from '../types'
import type { MetricOutputSource } from '../../../api/metricSources'
import type { MetricMemberStatisticsState } from './useMetricMemberStatistics'
import { metricHostMessages } from './messages'
const props = defineProps<{ state:MetricMemberStatisticsState; scopeLabel:string; includeChildren:boolean }>()
const { t, locale } = useI18n({ useScope:'local', messages:metricHostMessages })
const outputName = (item:MetricOutputSource) => metricOutputName(item.output, localizedTemplate(item.template, String(locale.value))) || item.output.metricId
const operations = computed(() => ['count', 'sum'].map(value => ({ value, label:t(`statistics_${value}`), icon:value === 'count' ? 'NumberOutlined' : 'FunctionOutlined', description:t(`statistics_${value}Description`), disabled:value === 'sum' && !!props.state.selected.value && !props.state.numeric(props.state.selected.value) })))
const operators = computed(() => (props.state.spec.value.operation === 'sum' ? ['all', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte'] : ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'])
  .filter(value => ['all', 'eq', 'ne'].includes(value) || !props.state.selected.value || props.state.numeric(props.state.selected.value))
  .map(value => ({ value, label:t(`statistics_${value}`), icon:'FilterOutlined', description:t('statisticsConditionDescription') })))
const periods = computed(() => ['current', 'day', 'week', 'month'].map(value => ({ value, label:t(`statistics_${value}`), icon:'CalendarOutlined', description:t(value === 'current' ? 'statisticsCurrentHint' : 'statisticsCalendarHint') })))
const auxiliaryOptions = computed(() => props.state.auxiliary.value.map(item => ({ value:item.output.metricId, label:outputName(item), icon:'NodeIndexOutlined', description:item.output.unit || item.output.metricId })))
const freshness = computed(() => [5, 10, 30, 60].map(value => ({ value:`PT${value}M`, label:t('statisticsMinutes', { count:value }), icon:'ClockCircleOutlined', description:t('statisticsFreshDescription') })))
const booleanValues = computed(() => [{ value:true, label:t('statisticsTrue'), icon:'CheckCircleOutlined' }, { value:false, label:t('statisticsFalse'), icon:'CloseCircleOutlined' }])
const valueEditor = computed(() => props.state.selected.value?.output.valueType === 'boolean' ? 'select' : props.state.selected.value && props.state.numeric(props.state.selected.value) ? 'number' : 'string')
let timer:ReturnType<typeof setTimeout> | undefined
function search() { clearTimeout(timer); timer = setTimeout(() => { props.state.page.value = 1; void props.state.search() }, 250) }
function retry() { if (props.state.choosingProduct.value) void props.state.search(); else void props.state.selectProduct(props.state.productId.value, true) }
onScopeDispose(() => clearTimeout(timer))
</script>
<style scoped>
.member-statistics { min-width:0; font-size:12px; line-height:1.7 }
.member-statistics header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px }
.member-statistics header b { font-weight:500 }
.member-statistics p { margin:6px 0 }
.statistics-scope,.statistics-note { color:var(--ink-3); font-size:11px }
.statistics-step { position:relative; padding:4px 0 16px 23px; margin-left:6px; border-left:1px solid var(--line) }
.statistics-step::before { content:''; position:absolute; top:13px; left:-4px; width:7px; height:7px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 3px var(--panel-background) }
.statistics-step>small { display:flex; align-items:center; gap:6px; color:var(--ink-3); font-size:11px }
.statistics-sentence { display:flex; flex-wrap:wrap; align-items:center; gap:3px; min-width:0 }
.statistics-sentence :deep(.editable-field) { max-width:100%; background:var(--bg-sunken); border-radius:4px; color:var(--accent) }
.statistics-sentence :deep(.editable-field__control) { min-width:90px }
.statistics-token { display:inline-flex; align-items:center; gap:7px; padding:2px 6px; max-width:100%; border:0; border-radius:4px; background:var(--accent-soft); color:var(--accent); overflow-wrap:anywhere; cursor:pointer }
.statistics-options { display:grid; gap:3px; min-width:0; margin-top:8px }
.statistics-options button,.statistics-selected { display:flex; align-items:center; gap:8px; width:100%; min-width:0; padding:8px; border:1px solid var(--line); border-radius:var(--r-2,6px); background:var(--panel-background); color:var(--ink-2); text-align:left; cursor:pointer }
.statistics-options button { border-color:transparent }
.statistics-options button:hover { background:var(--bg-sunken) }
.statistics-options button>span,.statistics-selected>span { flex:1; min-width:0; overflow-wrap:anywhere }
.statistics-options b,.statistics-selected b { font-weight:500 }
.statistics-options small,.statistics-selected small { display:block; color:var(--ink-3); font-size:11px }
.statistics-options em { font-size:11px; color:var(--ink-3); font-style:normal }
.statistics-options .anticon,.statistics-selected .anticon { flex:none }
.statistics-search { display:flex; align-items:center; gap:8px; min-height:32px; border-bottom:1px solid var(--line) }
.statistics-search input { min-width:0; width:100%; border:0; outline:0; background:transparent; color:var(--ink-1) }
.statistics-warning { color:var(--warning, #bf871a); font-size:11px }
.member-statistics button:focus-visible { outline:2px solid var(--accent) }
</style>
