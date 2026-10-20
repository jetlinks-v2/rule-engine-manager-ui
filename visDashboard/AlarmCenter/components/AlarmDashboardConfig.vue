<template>
  <a-collapse v-model:active-key="panels" ghost>
    <a-collapse-panel key="main" :header="t('alarmDashboard.keyConfig')">
      <a-form layout="vertical">
        <a-form-item :label="t('alarmDashboard.title')">
          <a-input :value="config.title" :maxlength="60" :placeholder="t('alarmDashboard.' + kind)" @update:value="update('title', $event)" />
        </a-form-item>
        <a-form-item v-if="kind === 'AlarmTrend'" :label="t('alarmDashboard.defaultRange')">
          <a-select :value="config.timeRange" :options="rangeOptions" @update:value="update('timeRange', $event)" />
        </a-form-item>
        <a-form-item v-if="statistics" :label="t('alarmDashboard.defaultDimension')">
          <a-select :value="config.dimension" :options="dimensionOptions" @update:value="update('dimension', $event)" />
        </a-form-item>
      </a-form>
    </a-collapse-panel>
    <a-collapse-panel v-if="kind !== 'QuickStart'" key="more" :header="t('alarmDashboard.moreConfig')">
      <a-form layout="vertical">
        <a-form-item :label="t('alarmDashboard.refresh')" :help="t('alarmDashboard.refreshHelp')">
          <a-input-number :value="config.refreshSeconds" :min="0" :max="3600" :step="15" @update:value="update('refreshSeconds', $event)" />
        </a-form-item>
        <a-form-item v-if="statistics" :label="t('alarmDashboard.limit')">
          <a-input-number :value="config.limit" :min="1" :max="50" :precision="0" @update:value="update('limit', $event)" />
        </a-form-item>
      </a-form>
    </a-collapse-panel>
  </a-collapse>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { dashboardKinds, typeOf, type AlarmWidgetConfig, type AlarmWidgetInfo } from '../dashboard.types'
import { settingsOf, timeRanges } from '../dashboardConfig'
const props = defineProps<{ activeComponent: AlarmWidgetInfo }>()
const emit = defineEmits<{ change: [value: AlarmWidgetConfig, key: string] }>()
const { t } = useI18n()
const panels = ref(['main'])
const kind = computed(() => dashboardKinds.find(value => typeOf(value) === props.activeComponent.type) || 'TodayEvents')
const config = computed(() => settingsOf(kind.value, props.activeComponent))
const statistics = computed(() => ['IotStatistics', 'VisionStatistics'].includes(kind.value))
const rangeOptions = computed(() => timeRanges.map(value => ({ value, label: t('alarmDashboard.range.' + value) })))
const dimensionOptions = computed(() => ['type', kind.value === 'IotStatistics' ? 'deviceType' : 'camera']
  .map(value => ({ value, label: t('alarmDashboard.dimension.' + value) })))
/** 通过草稿协议提交完整命名空间，取消配置时运行组件不受影响。 */
function update(key: keyof AlarmWidgetConfig, value: unknown) {
  const next = settingsOf(kind.value, { componentProps: { [typeOf(kind.value)]: { ...config.value, [key]: value } } })
  emit('change', next, typeOf(kind.value))
}
</script>

