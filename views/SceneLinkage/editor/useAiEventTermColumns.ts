import { ref, watch, type Ref } from 'vue'
import { querySceneTermColumns } from '../../../api/scene-linkage'
import { buildRequest, defaultForm, normalizeResult, type SceneAiEventTriggerConfig } from '../utils'

export type AiEventTermColumn = {
  column: string
  name?: string
  termTypes?: Array<{ id?: string }>
}

/** AI Provider 是条件字段的唯一来源，避免编辑器维护另一份结果字段字典。 */
export const useAiEventTermColumns = (config: Ref<SceneAiEventTriggerConfig>): Ref<AiEventTermColumn[]> => {
  const columns = ref<AiEventTermColumn[]>([])
  let latestRequest = 0

  watch(
    () => [config.value.sceneId, config.value.taskTarget],
    async ([sceneId, taskTarget]) => {
      if (!sceneId || !taskTarget) {
        columns.value = []
        return
      }
      const requestId = ++latestRequest
      const draft = defaultForm()
      draft.triggerKind = 'ai-event'
      draft.aiEvent = config.value
      const response = await querySceneTermColumns(buildRequest(draft))
      if (requestId !== latestRequest) return
      columns.value = normalizeResult<AiEventTermColumn>(response).data
    },
    { immediate: true },
  )

  return columns
}
