<template>
  <section class="alarm-widget" :class="{ 'alarm-widget-metric': metric }" :data-alarm-kind="kind" :aria-label="title">
    <header v-if="!metric">
      <h3>{{ title }}</h3>
      <a-segmented v-if="kind === 'AlarmTrend' || handling" v-model:value="timeRange" class="alarm-widget-switch" size="small" :options="rangeOptions" />
      <div v-else-if="statistics" class="alarm-widget-actions">
        <a-segmented v-model:value="dimension" class="alarm-widget-switch" size="small" :options="dimensionOptions" />
        <a-button v-if="showMoreRanking" type="link" size="small" :disabled="loading" @click="rankingOpen = true">{{ t('alarmDashboard.viewMore') }}</a-button>
      </div>
    </header>
    <div v-if="loading && (!handling || !data.handling)" class="alarm-widget-state"><a-spin /></div>
    <div v-else-if="error" class="alarm-widget-state" role="alert">
      <CloudEmpty :description="t('alarmDashboard.loadError')" />
      <a-button size="small" @click="refresh">{{ t('alarmDashboard.retry') }}</a-button>
    </div>
    <div v-else class="alarm-widget-content" :class="{ 'alarm-widget-quick': kind === 'QuickStart' }">
      <AlarmMetricPanel v-if="metric" :title="title" :icon="metricIcon" :event="kind === 'TodayEvents'" :data="data.metric" @retry="refresh">
        <template v-if="hints.length" #hint><AlarmConfigurationGuide :items="hints" mode="compact" @open="open" @retry="refreshConfiguration" /></template>
      </AlarmMetricPanel>
      <AlarmQuickStartPanel v-else-if="kind === 'QuickStart'" :actions="quickActions" @open="open" />
      <template v-else-if="handling">
        <AlarmConfigurationGuide v-if="hints.length" :items="hints" @open="open" @retry="refreshConfiguration" />
        <AlarmHandlingPanel :value="data.handling" :range="data.window" :source="handlingSource" :is-edit="isEdit" :loading="loading" @retry="refresh" />
      </template>
      <AlarmConfigurationGuide v-else-if="guideEmpty" :items="hints" mode="empty" @open="open" @retry="refreshConfiguration" />
      <template v-else>
        <AlarmConfigurationGuide v-if="hints.length" :items="hints" @open="open" @retry="refreshConfiguration" />
        <template v-if="kind === 'AlarmTrend'">
          <div v-if="failedSeries.length" class="alarm-widget-warning" role="alert">
            {{ t('alarmDashboard.seriesFailed', { names: failedSeries.join('、') }) }}
            <a-button type="link" size="small" @click="refresh">{{ t('alarmDashboard.retry') }}</a-button>
          </div>
          <div class="alarm-chart"><AlarmTrendPanel :series="data.series" :time-range="timeRange" /></div>
        </template>
        <template v-else>
          <p class="alarm-widget-caption" :style="{ fontSize: chartTextStyle.fontSize + 'px', fontWeight: chartTextStyle.fontWeight, color: chartTextStyle.color }">{{ t('alarmDashboard.dimension.' + dimension) }} · {{ t('alarmDashboard.range.today') }}</p>
          <AlarmStatisticsPanel :items="data.ranking" :vision="kind === 'VisionStatistics'" :preview="isEdit" />
        </template>
      </template>
    </div>
    <AlarmRankingDialog v-if="statistics && rankingOpen" v-model:open="rankingOpen" :title="title" :items="data.ranking"
      :dimension="dimension" :preview="isEdit" :loading="loading" :error="error" @retry="refresh" />
  </section>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, onDeactivated, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAlarmWidget } from '../hooks/useAlarmWidget'
import { useAlarmTypography } from '../hooks/useAlarmTypography'
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
const chartTextStyle = useAlarmTypography()
const { config, data, loading, error, timeRange, dimension, refresh } = useAlarmWidget(props.kind, toRef(props, 'info'), toRef(props, 'isEdit'))
const { actions, open } = useAlarmQuickStart(toRef(props, 'isEdit'))
const rankingOpen = ref(false)
// 弹窗始终对应打开时的维度，离开页面后不保留浮层。
watch(dimension, () => { rankingOpen.value = false })
onDeactivated(() => { rankingOpen.value = false })
const { state: ruleConfiguration, refresh: refreshConfiguration } = useAlarmRuleConfiguration(toRef(props, 'isEdit'))
const hints = computed(() => configurationHintsFor(props.kind, ruleConfiguration.value, actions.value))
// 未配置规则不能抹掉已有事件和历史告警，只在图表确实无记录时替换通用空态。
const guideEmpty = computed(() => hints.value.some(item => item.status === 'missing') && (
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
</script>
<style scoped>
.alarm-widget {
  width: 100%; height: 100%; min-width: 0; min-height: 0; box-sizing: border-box; display: flex; flex-direction: column;
  background: var(--ant-color-bg-container, #fff); border: 1px solid var(--jet-theme-border-color-1, #eceff3);
  border-radius: var(--r-3, 8px); padding: 16px; color: var(--ink-1, #1d2129);
  box-shadow: 0 1px 3px rgb(0 0 0 / 4%); font-size: 14px; line-height: 1.4; container: alarm-widget / inline-size;
}
.alarm-widget-metric { padding: 10px 16px; }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; flex: none; }
.alarm-widget-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
h3 { margin: 0; font-size: 16px; font-weight: 500; line-height: 24px; }
.alarm-widget-switch.ant-segmented {
  max-width: 100%; overflow-x: auto; padding: 3px; font-size: 12px;
  background: #f5f6f8; color: var(--ink-2, #4e5969);
  border: 1px solid var(--jet-theme-border-color-1, #eceff3); border-radius: 6px;
}
.alarm-widget-switch :deep(.ant-segmented-item),
.alarm-widget-switch :deep(.ant-segmented-thumb) { border-radius: 4px; }
.alarm-widget-switch :deep(.ant-segmented-item-label) { min-height: 26px; padding: 2px 10px; line-height: 22px; }
.alarm-widget-switch :deep(.ant-segmented-item-selected),
.alarm-widget-switch :deep(.ant-segmented-thumb) {
  background: var(--ant-color-bg-container, #fff); color: var(--ant-color-primary, #1677ff);
  box-shadow: 0 1px 3px #1d212914;
}
.alarm-widget-switch :deep(.ant-segmented-item:has(input:focus-visible)) {
  outline: 2px solid var(--ant-color-primary, #1677ff); outline-offset: -1px;
}
.alarm-widget-content { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: auto; }
.alarm-widget-quick { display: block; }
.alarm-widget-state { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; flex: 1; min-height: 0; overflow: auto; }
.alarm-widget-caption { margin: 0 0 4px; line-height: 20px; flex: none; }
.alarm-chart { flex: 1; min-height: 0; }
.alarm-widget-warning { color: var(--ant-color-error, #ff4d4f); font-size: 12px; flex: none; }
</style>

