import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore, useMenuStore } from '@jetlinks-web-core/store'
import type { MetricAlarmReference } from './types'

/** 按菜单权限从业务对象进入指标工作区。 */
export function useMetricLinks() {
  const route = useRoute()
  const auth = useAuthStore()
  const menu = useMenuStore()
  const workspaceEnabled = computed(() => menu.hasMenu('rule-engine/Metric') && auth.hasPermission('rule-engine/Metric:view'))
  function openWorkspace(reference: MetricAlarmReference) {
    if (!workspaceEnabled.value) return
    menu.jumpPage('rule-engine/Metric', { query: { projectId: route.query.projectId,
      metricOwnerType: reference.ownerType, metricOwnerId: reference.ownerId,
      metricConfigId: reference.configId, metricOutputId: reference.outputId } })
  }
  return { workspaceEnabled, openWorkspace }
}
