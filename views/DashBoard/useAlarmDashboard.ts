import { computed, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@jetlinks-web-core/store/user'
import { isSaaS } from '@jetlinks-web-core/utils/consts'
import { getProjectCodeFromLocation } from '@jetlinks-web-core/utils/project-runtime'
import { getRequestBaseApi } from '@jetlinks-web-core/utils/request-context'
import { dashboardSources } from '@jetlinks-web-core/components/DashBoardCanvas/dashboard-sources'
import { useDashboardCatalog } from '@jetlinks-web-core/components/DashBoardCanvas/discovery'
import type { DashboardValue } from '@jetlinks-web-core/components/DashBoardCanvas'
import { dashboardKinds, isAlarmKindAvailable, typeOf } from '../../visDashboard/AlarmCenter/dashboard.types'
import { useAlarmCapabilities } from '../../visDashboard/AlarmCenter/hooks/useAlarmCapabilities'
import { addHandlingStatisticsToLayout, alarmDashboardLayout, alarmLayoutMode } from './alarmDashboardLayout'
import { alarmDashboardStorageKeys } from './alarmDashboardStorage'
import { readDashboardLayout } from '@jetlinks-web-core/components/DashBoardCanvas/utils/layoutStorage'

const group = 'rule-engine-manager-ui/visDashboard/AlarmCenter'
const thumbnails = import.meta.glob('../../visDashboard/AlarmCenter/*/thumbnail.svg', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>

/** 只发现本页明确声明的入口，不加载旧组件，也不修改公共组件扫描规则。 */
export function useAlarmDashboard(width: Ref<number>, preview: Ref<boolean> = ref(false)) {
  const user = useUserStore()
  const route = useRoute()
  const capabilities = useAlarmCapabilities(preview)
  const availableKinds = computed(() => dashboardKinds.filter(kind => isAlarmKindAvailable(kind, capabilities.value)))
  const discovery = useDashboardCatalog(dashboardSources, computed(() => ({
    modules: ['rule-engine-manager-ui'], directories: ['visDashboard'], groups: [group],
    entries: availableKinds.value.map(kind => `${group}/${kind}`),
  })))
  const mode = computed(() => alarmLayoutMode(width.value))
  const scope = computed(() => JSON.stringify([
    user.userInfo.id || '', route.params.projectId || '', route.query.projectId || '', getProjectCodeFromLocation(), getRequestBaseApi(),
  ]))
  const storage = computed(() => alarmDashboardStorageKeys(scope.value, isSaaS, mode.value, capabilities.value))
  const storageKey = computed(() => preview.value ? undefined : storage.value.key)
  const legacyStorageKeys = computed(() => preview.value ? [] : storage.value.legacyKeys)
  // 在画布检查组件清单之前补齐新增卡，避免其默认的不匹配清理抹掉个人排版。
  watch([storage, discovery.loading, preview], ([keys, loading, isPreview]) => {
    if (loading || isPreview || !capabilities.value.ready || !capabilities.value.events || !capabilities.value.vision) return
    try {
      if (typeof localStorage === 'undefined') return
      const saved = readDashboardLayout(localStorage, keys.key, keys.legacyKeys)
      const upgraded = saved && addHandlingStatisticsToLayout(saved, mode.value)
      if (upgraded) localStorage.setItem(keys.key, JSON.stringify(upgraded))
    } catch { /* 存储不可用时继续使用默认布局，不阻断统计和处理。 */ }
  }, { immediate: true, flush: 'sync' })
  const catalog = computed(() => ({
    ...discovery.catalog.value,
    components: Object.fromEntries(Object.entries(discovery.catalog.value.components).map(([type, definition]) => {
      const kind = dashboardKinds.find(value => typeOf(value) === type)
      return [type, { ...definition, thumbnail: thumbnails[`../../visDashboard/AlarmCenter/${kind}/thumbnail.svg`] }]
    })),
  }))
  const dashboard = computed<DashboardValue>(() => ({
    // 保留原有 34px 网格步长，让已保存的卡片位置和高度不随间距调整明显变化。
    canvas: { backgroundColor: 'transparent', gridLayout: { colNum: 24, rowHeight: 18, marginHorizontal: 16, marginVertical: 16 } },
    components: alarmDashboardLayout(mode.value, capabilities.value).flatMap(([kind, x, y, w, h]) => {
      const type = typeOf(kind)
      const definition = catalog.value.components[type]
      if (!definition) return []
      return [{
        ...definition.defaultConfig, id: type, type,
        componentProps: {
          ...definition.defaultConfig.componentProps,
          gridItem: { ...definition.defaultGridItem, x, y, w, h },
        },
      }]
    }),
  }))
  return { ...discovery, catalog, dashboard, storageKey, legacyStorageKeys,
    loading: computed(() => !capabilities.value.ready || discovery.loading.value) }
}

