import { computed, inject, provide, ref, watch, type InjectionKey, type Ref } from 'vue'
import { querySceneNotifyChannels, querySceneNotifyUsers, type SceneNotifyMethod, type SceneNotifyUser } from '../../../../api/scene-linkage'
import { normalizeResult } from '../../utils'
import type { SceneRuleRecord } from '../editorMode'

type NotifyLabels = { users: Ref<SceneNotifyUser[]>; methods: Ref<SceneNotifyMethod[]> }
const key: InjectionKey<NotifyLabels> = Symbol('scene-notify-labels')

/** 按详细规则中的已选收信人批量补齐展示名称，保持既有查询权限和原始规则数据不变。 */
export function provideSceneNotifyLabels(rule: Ref<SceneRuleRecord>) {
  const users = ref<SceneNotifyUser[]>([])
  const methods = ref<SceneNotifyMethod[]>([])
  provide(key, { users, methods })
  const selected = computed(() => {
    const actions = (rule.value.branches || []).flatMap((branch: SceneRuleRecord) => (branch?.then || [])
      .flatMap((group: SceneRuleRecord) => group?.actions || []))
      .filter((action: SceneRuleRecord) => action?.executor === 'sceneNotify')
    return {
      ids: [...new Set<string>(actions.flatMap((action: SceneRuleRecord) => action.configuration?.userIds || []).map(String))].sort(),
      channels: [...new Set<string>(actions.flatMap((action: SceneRuleRecord) => action.configuration?.notifyChannelIds || []).map(String))].sort(),
    }
  })
  let requestId = 0
  watch(() => JSON.stringify(selected.value), async () => {
    const current = ++requestId
    const { ids, channels } = selected.value
    if (!ids.length && !channels.length) { users.value = []; methods.value = []; return }
    const [userResult, methodResult] = await Promise.all([
      ids.length ? querySceneNotifyUsers({ paging: false, userIds: ids }).catch(() => undefined) : undefined,
      channels.length ? querySceneNotifyChannels().catch(() => undefined) : undefined,
    ])
    // 切换、删除或改选后，旧请求不能把过时名称回填到当前摘要。
    if (current !== requestId) return
    users.value = userResult ? normalizeResult<SceneNotifyUser>(userResult).data : []
    methods.value = methodResult ? normalizeResult<SceneRuleRecord>(methodResult).data
      .filter(provider => provider.provider === 'scene')
      .flatMap(provider => (provider.channels || []).map((channel: SceneRuleRecord) => ({
        id: String(channel.id), name: channel.name || channel.channelProvider,
        providerId: provider.id || provider.provider, channelProvider: channel.channelProvider,
      }))) : []
  }, { immediate: true })
}

/** 展示组件只读取父级提供的名称，不自行请求或改写规则。 */
export function useSceneNotifyLabels(): NotifyLabels {
  return inject(key, { users: ref([]), methods: ref([]) })
}
