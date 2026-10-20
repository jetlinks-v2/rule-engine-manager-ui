import { computed, ref, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@jetlinks-web-core/store/user'
import { isSaaS } from '@jetlinks-web-core/utils/consts'
import { getProjectCodeFromLocation } from '@jetlinks-web-core/utils/project-runtime'
import { getRequestBaseApi } from '@jetlinks-web-core/utils/request-context'
import { dashboardSources } from '@jetlinks-web-core/components/DashBoardCanvas/dashboard-sources'
import { useDashboardCatalog } from '@jetlinks-web-core/components/DashBoardCanvas/discovery'
import type { DashboardValue } from '@jetlinks-web-core/components/DashBoardCanvas'
import { dashboardKinds, typeOf } from '../../visDashboard/AlarmCenter/dashboard.types'
import { alarmDashboardLayout, alarmLayoutMode } from './alarmDashboardLayout'
import { alarmDashboardStorageKeys } from './alarmDashboardStorage'

const group = 'rule-engine-manager-ui/visDashboard/AlarmCenter'
const thumbnails = import.meta.glob('../../visDashboard/AlarmCenter/*/thumbnail.svg', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>

/** 只发现本页七个新入口，不加载旧组件，也不修改公共组件扫描规则。 */
export function useAlarmDashboard(width: Ref<number>, preview: Ref<boolean> = ref(false)) {
  const user = useUserStore()
  const route = useRoute()
  const discovery = useDashboardCatalog(dashboardSources, {
    modules: ['rule-engine-manager-ui'], directories: ['visDashboard'], groups: [group],
    entries: dashboardKinds.map(kind => `${group}/${kind}`),
  })
  const mode = computed(() => alarmLayoutMode(width.value))
  const scope = computed(() => JSON.stringify([
    user.userInfo.id || '', route.params.projectId || '', route.query.projectId || '', getProjectCodeFromLocation(), getRequestBaseApi(),
  ]))
  const storage = computed(() => alarmDashboardStorageKeys(scope.value, isSaaS, mode.value))
  const storageKey = computed(() => preview.value ? undefined : storage.value.key)
  const legacyStorageKeys = computed(() => preview.value ? [] : storage.value.legacyKeys)
  const catalog = computed(() => ({
    ...discovery.catalog.value,
    components: Object.fromEntries(Object.entries(discovery.catalog.value.components).map(([type, definition]) => {
      const kind = dashboardKinds.find(value => typeOf(value) === type)
      return [type, { ...definition, thumbnail: thumbnails[`../../visDashboard/AlarmCenter/${kind}/thumbnail.svg`] }]
    })),
  }))
  const dashboard = computed<DashboardValue>(() => ({
    canvas: { backgroundColor: 'transparent', gridLayout: { colNum: 24, rowHeight: 16, marginHorizontal: 18, marginVertical: 18 } },
    components: alarmDashboardLayout(mode.value).flatMap(([kind, x, y, w, h]) => {
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
  return { ...discovery, catalog, dashboard, storageKey, legacyStorageKeys }
}

