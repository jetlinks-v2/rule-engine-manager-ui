<template>
  <section v-if="available" class="alarm-widget" :class="{ 'alarm-widget-metric': metric }" :data-alarm-kind="kind" :aria-label="title">
    <header v-if="!metric">
      <h3>{{ title }}</h3>
      <a-segmented v-if="kind === 'AlarmTrend' || handling" v-model:value="timeRange" class="alarm-widget-switch" size="small" :options="rangeOptions" />
      <div v-else-if="statistics" class="alarm-widget-actions">
        <a-segmented v-model:value="dimension" class="alarm-widget-switch" size="small" :options="dimensionOptions" />
        <a-button v-if="showMoreRanking" type="link" size="small" :disabled="loading" @click="rankingOpen = true">{{ t('alarmDashboard.viewMore') }}</a-button>
      </div>
    </header>
    <div v-if="loading && (!handling || !data.handling)" class="alarm-widget-state"><a-spin /></div>
    <div v-else-if="error || trendFailed" class="alarm-widget-state" role="alert">
      <CloudEmpty :description="t('alarmDashboard.loadError')" :image-style="{ height: '48px' }" />
    </div>
    <div v-else class="alarm-widget-content" :class="{ 'alarm-widget-quick': kind === 'QuickStart', 'alarm-widget-ranking': statistics }">
      <AlarmMetricPanel v-if="metric" :title="title" :icon="metricIcon" :event="kind === 'TodayEvents'" :data="data.metric">
        <template v-if="hints.length" #hint><AlarmConfigurationGuide :items="hints" mode="compact" @open="open" /></template>
      </AlarmMetricPanel>
      <AlarmQuickStartPanel v-else-if="kind === 'QuickStart'" :actions="quickActions" @open="open" />
      <template v-else-if="handling">
        <AlarmConfigurationGuide v-if="hints.length" :items="hints" @open="open" />
        <AlarmHandlingPanel :value="data.handling" :range="data.window" :source="handlingSource" :vision-enabled="capabilities.vision" :is-edit="isEdit" :loading="loading" />
      </template>
      <AlarmConfigurationGuide v-else-if="guideEmpty" :items="hints" mode="empty" @open="open" />
      <template v-else>
        <AlarmConfigurationGuide v-if="hints.length" :items="hints" @open="open" />
        <template v-if="kind === 'AlarmTrend'">
          <div v-if="failedSeries.length" class="alarm-widget-note" role="status" :title="t('alarmDashboard.seriesFailed', { names: failedSeries.join('、') })">
            {{ t('alarmDashboard.partialFailed') }}
          </div>
          <div class="alarm-chart"><AlarmTrendPanel :series="data.series" :time-range="timeRange" /></div>
        </template>
        <template v-else>
          <p class="alarm-widget-caption">{{ t('alarmDashboard.dimension.' + dimension) }} · {{ t('alarmDashboard.range.today') }}</p>
          <AlarmStatisticsPanel :items="data.ranking" :vision="kind === 'VisionStatistics'" :preview="isEdit" />
        </template>
      </template>
    </div>
    <AlarmRankingDialog v-if="statistics && rankingOpen" v-model:open="rankingOpen" :title="title" :items="data.ranking"
      :dimension="dimension" :preview="isEdit" :loading="loading" :error="error" />
  </section>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, onDeactivated, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAlarmWidget } from '../hooks/useAlarmWidget'
import { useAlarmQuickStart } from '../hooks/useAlarmQuickStart'
import { useAlarmRuleConfiguration } from '../hooks/useAlarmRuleConfiguration'
import { configurationHintsFor } from '../services/configuration'
import AlarmConfigurationGuide from './AlarmConfigurationGuide.vue'
import { alarmRankingLimit, handlingSourceOf, isHandlingKind, isMetricKind, type AlarmDashboardKind, type AlarmWidgetInfo } from '../dashboard.types'
import { timeRanges } from '../dashboardConfig'
import AlarmMetricPanel from './AlarmMetricPanel.vue'
import AlarmQuickStartPanel from './AlarmQuickStartPanel.vue'

const AlarmHandlingPanel = defineAsyncComponent(() => import('./AlarmHandlingPanel.vue'))
const AlarmRankingDialog = defineAsyncComponent(() => import('./AlarmRankingDialog.vue'))
const AlarmTrendPanel = defineAsyncComponent(() => import('./AlarmTrendPanel.vue'))
const AlarmStatisticsPanel = defineAsyncComponent(() => import('./AlarmStatisticsPanel.vue'))
const props = defineProps<{ kind: AlarmDashboardKind; info?: AlarmWidgetInfo; isEdit: boolean }>()
const { t } = useI18n()
const { config, data, loading, error, timeRange, dimension, capabilities, available } = useAlarmWidget(props.kind, toRef(props, 'info'), toRef(props, 'isEdit'))
const { actions, open } = useAlarmQuickStart(toRef(props, 'isEdit'), capabilities)
const rankingOpen = ref(false)
// 弹窗始终对应打开时的维度，离开页面后不保留浮层。
watch(dimension, () => { rankingOpen.value = false })
onDeactivated(() => { rankingOpen.value = false })
const { state: ruleConfiguration } = useAlarmRuleConfiguration(
  computed(() => props.isEdit || !available.value), computed(() => capabilities.value.vision))
const hints = computed(() => configurationHintsFor(props.kind, ruleConfiguration.value, actions.value, capabilities.value.vision))
// 未配置规则不能抹掉已有事件和历史告警，只在图表确实无记录时替换通用空态。
const guideEmpty = computed(() => hints.value.length > 0 && (
  props.kind === 'AlarmTrend' ? !data.value.series.some(item => item.points.length || item.failed) : !data.value.ranking.length
))
const quickActions = computed(() => actions.value.map(action => ({
  ...action,
  unconfigured: action.key === 'iotRules' ? ruleConfiguration.value.iot === 'missing'
    : action.key === 'visionRules' && ruleConfiguration.value.vision === 'missing',
})))
const handling = computed(() => isHandlingKind(props.kind))
const handlingSource = computed(() => handlingSourceOf(props.kind))
const metric = computed(() => isMetricKind(props.kind))
const statistics = computed(() => ['IotStatistics', 'VisionStatistics'].includes(props.kind))
const showMoreRanking = computed(() => statistics.value && !error.value && data.value.ranking.length > alarmRankingLimit)
const metricIcon = computed(() => props.kind === 'TodayEvents' ? 'FundOutlined' : props.kind === 'IotAlarms' ? 'DatabaseOutlined' : 'VideoCameraOutlined')
const title = computed(() => config.value.title || t('alarmDashboard.' + props.kind))
const rangeOptions = computed(() => timeRanges.map(value => ({ value, label: t('alarmDashboard.range.' + value) })))
const dimensionOptions = computed(() => ['type', props.kind === 'IotStatistics' ? 'deviceType' : 'camera']
  .map(value => ({ value, label: t('alarmDashboard.dimension.' + value) })))
const failedSeries = computed(() => data.value.series.filter(item => item.failed).map(item => t('alarmDashboard.source.' + item.source)))
const trendFailed = computed(() => props.kind === 'AlarmTrend' && data.value.series.length > 0 && data.value.series.every(item => item.failed))
</script>
<style scoped>
.alarm-widget {
  width: 100%; height: 100%; min-width: 0; min-height: 0; box-sizing: border-box; display: flex; flex-direction: column;
  background: var(--ant-color-bg-container, #fff); border: 1px solid var(--jet-theme-border-secondary, #e8edf3);
  border-radius: var(--r-3, 8px); color: #1d2939;
  box-shadow: 0 1px 3px rgb(0 0 0 / 3%); font-size: 14px; line-height: 1.4; container: alarm-widget / inline-size;
}
.alarm-widget-metric { padding: 16px; }
header { box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; min-height: 48px; padding: 8px 16px; border-bottom: 1px solid #f0f2f5; flex: none; }
.alarm-widget-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.alarm-widget-actions :deep(.ant-btn-link) { height: auto; padding: 0; font-size: 13px; }
h3 { min-width: 0; margin: 0; font-size: 15px; font-weight: 600; line-height: 24px; color: #17243b; overflow-wrap: anywhere; }
.alarm-widget-switch.ant-segmented {
  max-width: 100%; overflow-x: auto; padding: 3px; border-radius: 9px;
  background: #f3f4f6; color: #4e5969;
}
.alarm-widget-switch :deep(.ant-segmented-group) { gap: 2px; }
.alarm-widget-switch :deep(.ant-segmented-item),
.alarm-widget-switch :deep(.ant-segmented-thumb) { border-radius: 6px; }
.alarm-widget-switch :deep(.ant-segmented-item-label) { min-height: 22px; padding: 4px 10px; line-height: 14px; font-size: 12px; }
.alarm-widget-switch :deep(.ant-segmented-item-selected) {
  background: #fff; color: #1677ff; box-shadow: 0 1px 3px rgba(0, 0, 0, .08);
}
.alarm-widget-switch :deep(.ant-segmented-item:has(input:focus-visible)) {
  outline: 2px solid #1677ff; outline-offset: -1px;
}
.alarm-widget-content { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: auto; }
.alarm-widget:not(.alarm-widget-metric) .alarm-widget-content { padding: 16px; }
.alarm-widget:not(.alarm-widget-metric) .alarm-widget-ranking { padding-top: 12px; }
/* 移除空态尾部的默认留白，让图片和说明整体居中。 */
.alarm-widget :deep(.cloud-empty .ant-empty-description) { margin-bottom: 0; }
.alarm-widget :deep(.cloud-empty .ant-empty-footer:empty) { display: none; }
.alarm-widget-quick { display: block; }
.alarm-widget-state { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; flex: 1; min-height: 0; padding: 16px; overflow: auto; }
.alarm-widget-caption { margin: 0 0 10px; padding: 0 2px; font-size: 12px; line-height: 18px; color: #64748b; flex: none; }
.alarm-chart { flex: 1; min-height: 0; }
.alarm-widget-note { color: var(--ink-3, #86909c); font-size: 12px; flex: none; }
</style>

