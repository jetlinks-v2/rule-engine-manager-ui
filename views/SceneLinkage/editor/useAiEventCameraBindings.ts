import { ref } from 'vue'
import {
  queryAiEventCameraBindingStatus,
  type AiEventCameraBindingStatus,
} from '../../../api/scene-linkage'
import { normalizeResult } from '../utils'

export interface AiEventCameraBinding {
  sceneId: string
  taskTarget: string
}

/**
 * Loads enabled visual-algorithm bindings for the single camera allowed by quick configuration.
 * The binding endpoint uses a media-channel entity ID, while the saved trigger keeps the runtime
 * `deviceId/channelId` pair; the caller persists the entity ID only as editor echo metadata.
 */
export function useAiEventCameraBindings() {
  const bindings = ref<AiEventCameraBinding[]>([])
  const loading = ref(false)
  const loadFailed = ref(false)
  let requestVersion = 0

  async function loadBindings(channelEntityId?: string) {
    const version = ++requestVersion
    bindings.value = []
    loadFailed.value = false
    if (!channelEntityId) return []

    loading.value = true
    try {
      const result = normalizeResult<AiEventCameraBindingStatus>(await queryAiEventCameraBindingStatus({
        cloudChannelEntityIds: [channelEntityId],
      }))
      const next = result.data
        .flatMap(item => item.info || [])
        .filter(item => isEnabledBinding(item) && item.sceneId && item.taskTarget)
        .map(item => ({ sceneId: item.sceneId!, taskTarget: item.taskTarget! }))
      const unique = new Map(next.map(item => [`${item.sceneId}:${item.taskTarget}`, item]))
      if (version === requestVersion) bindings.value = [...unique.values()]
      return version === requestVersion ? bindings.value : []
    } catch {
      if (version === requestVersion) loadFailed.value = true
      return []
    } finally {
      if (version === requestVersion) loading.value = false
    }
  }

  return { bindings, loading, loadFailed, loadBindings }
}

function isEnabledBinding(binding: NonNullable<AiEventCameraBindingStatus['info']>[number]) {
  const state = binding.state
  return (typeof state === 'string' ? state : state?.value) === 'enabled'
}
