import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { useUserStore } from '@jetlinks-web-core/store/user'
import { useRoute } from 'vue-router'
import { getProjectCodeFromLocation } from '@jetlinks-web-core/utils/project-runtime'
import { getRequestBaseApi } from '@jetlinks-web-core/utils/request-context'
import { createAlarmDashboardApi } from '../../../api/alarmDashboard'
import { settingsOf } from '../dashboardConfig'
import { emptyWidgetData, type AlarmDashboardKind, type AlarmWidgetInfo, type AlarmDimension, type AlarmTimeRange } from '../dashboard.types'
import { loadAlarmMetrics, loadEventMetrics } from '../services/metrics'
import { loadTrends } from '../services/trends'
import { loadStatistics } from '../services/statistics'
import { previewData } from '../services/preview'

/** 每个实例独立管理请求/计时器，布局变化不触发重新取数；停用或范围变化立即废弃旧响应。 */
export function useAlarmWidget(kind: AlarmDashboardKind, info: Ref<AlarmWidgetInfo | undefined>, isEdit: Ref<boolean>) {
  const config = computed(() => settingsOf(kind, info.value))
  const timeRange = ref<AlarmTimeRange>(config.value.timeRange)
  const dimension = ref<AlarmDimension>(config.value.dimension)
  const data = shallowRef(emptyWidgetData())
  const loading = ref(false)
  const error = ref(false)
  const active = ref(true)
  const user = useUserStore()
  const route = useRoute()
  const api = createAlarmDashboardApi()
  const scope = computed(() => JSON.stringify([
    user.userInfo.id, route.params.projectId, route.query.projectId, route.path,
    getProjectCodeFromLocation(), getRequestBaseApi(),
  ]))
  let version = 0
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancel() {
    ++version
    controller?.abort()
    clearTimeout(timer)
  }
  async function refresh() {
    cancel()
    const current = version
    error.value = false
    if (!active.value || kind === 'QuickStart') { loading.value = false; return }
    if (isEdit.value) {
      data.value = previewData(kind, timeRange.value, dimension.value)
      loading.value = false
      return
    }
    controller = new AbortController()
    const signal = controller.signal
    loading.value = true
    try {
      const result = kind === 'TodayEvents' ? await loadEventMetrics(api, signal)
        : kind === 'IotAlarms' || kind === 'VisionAlarms'
          ? await loadAlarmMetrics(api, kind === 'IotAlarms' ? 'device' : 'aiTaskMediaTarget', signal)
          : kind === 'AlarmTrend' ? await loadTrends(api, timeRange.value, signal)
            : await loadStatistics(api, kind === 'IotStatistics' ? 'device' : 'aiTaskMediaTarget', dimension.value, config.value.limit, signal)
      if (current === version) data.value = result
    } catch (cause) {
      if (current === version && !signal.aborted) {
        data.value = emptyWidgetData()
        error.value = true
        console.warn('[AlarmDashboard] Widget query failed:', kind, cause)
      }
    } finally {
      if (current === version) {
        loading.value = false
        // 完成后再调度下一轮，慢请求不会与后续自动刷新重叠。
        if (config.value.refreshSeconds) timer = setTimeout(refresh, config.value.refreshSeconds * 1000)
      }
    }
  }
  watch(() => config.value.timeRange, value => { timeRange.value = value })
  watch(() => config.value.dimension, value => { dimension.value = value })
  watch([timeRange, dimension, () => config.value.refreshSeconds, () => config.value.limit, isEdit, active, scope], () => {
    data.value = emptyWidgetData()
    void refresh()
  }, { immediate: true })
  onActivated(() => { active.value = true })
  onDeactivated(() => { active.value = false; cancel() })
  onScopeDispose(cancel)
  return { config, timeRange, dimension, data, loading, error, refresh }
}

