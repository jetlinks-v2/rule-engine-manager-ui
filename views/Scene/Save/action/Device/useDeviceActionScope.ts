import { computed, inject, ref, watch, onScopeDispose } from 'vue'
import { storeToRefs } from 'pinia'
import { useSceneStore } from '../../../../../store/scene'
import { ACTION_DATA, getParams } from '../../util'
import { handleParamsData } from '../../components/Terms/util'
import type { ScopeMode } from '../../../../SceneLinkage/editor/deviceScopeTree'

/** 两种设备动作共用上游变量及关系的可用性，参数位置仍由原版接口计算。 */
export function useDeviceActionScope(props: { name: number; thenName: number }) {
  const { data } = storeToRefs(useSceneStore())
  const actionData = inject<{ branchIndex?: number }>(ACTION_DATA)
  const variables = ref<any[]>([])
  const loading = ref(false)
  let sequence = 0
  async function loadVariables() {
    const request = ++sequence
    loading.value = true
    try {
      const result = await getParams({ branch: actionData?.branchIndex || 0, branchGroup: props.thenName, action: props.name }, data.value)
      if (request === sequence) variables.value = handleParamsData(result, 'id')
    } finally {
      if (request === sequence) loading.value = false
    }
  }
  // 关系以触发设备 scene.deviceId 为源，保留原版单设备触发的适用边界。
  const disabledModes = computed<ScopeMode[]>(() => [
    ...(!variables.value.length ? ['context' as const] : []),
    ...(data.value.trigger?.type !== 'device' ? ['relation' as const] : []),
  ])
  watch(() => [props.name, props.thenName], () => { void loadVariables() }, { immediate: true })
  onScopeDispose(() => { ++sequence })
  return { variables, loading, disabledModes }
}
