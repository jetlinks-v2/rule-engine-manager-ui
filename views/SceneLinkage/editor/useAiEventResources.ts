import { computed, onBeforeUnmount, ref } from 'vue'
import {
  queryAiAggregateTasks,
  queryAiAlarmSceneTree,
  queryAiSceneTree,
  type AiAggregateTaskOption,
  type AiSceneTreeOption,
} from '../../../api/scene-linkage'
import { normalizeResult } from '../utils'

const SCENE_PAGE_SIZE = 30

/** 为 AI 事件行加载当前用户可访问的场景、算法与摄像头范围。 */
export const useAiEventResources = (sceneMode: 'event' | 'alarm' = 'event') => {
  const scenes = ref<AiSceneTreeOption[]>([])
  const aggregateTasks = ref<AiAggregateTaskOption[]>([])
  const loadingScenes = ref(false)
  const loadingAggregateTasks = ref(false)
  const scenePageIndex = ref(-1)
  const sceneTotal = ref(0)
  const sceneKeyword = ref('')
  const selectedScene = ref<AiSceneTreeOption>()
  const hasMoreScenes = computed(() => scenes.value.length < sceneTotal.value)
  const taskTargets = computed(() => (sceneId?: string) =>
    (scenes.value.find(item => item.id === sceneId)
      || (selectedScene.value?.id === sceneId ? selectedScene.value : undefined))?.children || [])
  let sceneRequestVersion = 0
  let selectedSceneRequestVersion = 0
  let aggregateTaskRequestVersion = 0
  let sceneSearchTimer: ReturnType<typeof setTimeout> | undefined

  const loadScenes = async (reset = false) => {
    if (!reset && (loadingScenes.value || (scenePageIndex.value >= 0 && !hasMoreScenes.value))) return
    const pageIndex = reset ? 0 : scenePageIndex.value + 1
    const requestVersion = ++sceneRequestVersion
    if (reset) {
      scenes.value = []
      scenePageIndex.value = -1
      sceneTotal.value = 0
    }
    loadingScenes.value = true
    try {
      const queryScenes = sceneMode === 'alarm' ? queryAiAlarmSceneTree : queryAiSceneTree
      const page = normalizeResult<AiSceneTreeOption>(await queryScenes({
        pageIndex,
        pageSize: SCENE_PAGE_SIZE,
        terms: createSceneSearchTerms(sceneKeyword.value),
        sorts: [{ name: 'createTime', order: 'desc' }],
      }))
      // 搜索词切换后只接收最新响应，避免较慢的旧请求覆盖当前下拉选项。
      if (requestVersion !== sceneRequestVersion) return
      scenes.value = reset ? page.data : mergeScenes(scenes.value, page.data)
      scenePageIndex.value = pageIndex
      sceneTotal.value = page.total
    } finally {
      if (requestVersion === sceneRequestVersion) loadingScenes.value = false
    }
  }

  /** 延迟搜索避免每个输入字符都请求场景树，并从首个分页结果重新开始。 */
  const searchScenes = (keyword: string) => {
    if (sceneSearchTimer) clearTimeout(sceneSearchTimer)
    sceneSearchTimer = setTimeout(() => {
      sceneKeyword.value = keyword.trim()
      void loadScenes(true)
    }, 250)
  }

  /** 为编辑中的历史规则补回选中场景的算法树，不受当前下拉分页和搜索词影响。 */
  const loadSelectedScene = async (sceneId?: string) => {
    const requestVersion = ++selectedSceneRequestVersion
    if (!sceneId) {
      selectedScene.value = undefined
      return
    }
    const loadedScene = scenes.value.find(item => item.id === sceneId)
    if (loadedScene) {
      selectedScene.value = loadedScene
      return
    }
    const queryScenes = sceneMode === 'alarm' ? queryAiAlarmSceneTree : queryAiSceneTree
    const page = normalizeResult<AiSceneTreeOption>(await queryScenes({
      pageIndex: 0,
      pageSize: 1,
      terms: [{ column: 'id', termType: 'eq', value: sceneId }],
    }))
    if (requestVersion === selectedSceneRequestVersion) selectedScene.value = page.data[0]
  }

  const loadAggregateTasks = async (sceneId?: string, taskTarget?: string) => {
    const requestVersion = ++aggregateTaskRequestVersion
    if (!sceneId || !taskTarget) {
      aggregateTasks.value = []
      loadingAggregateTasks.value = false
      return
    }
    loadingAggregateTasks.value = true
    try {
      const result = normalizeResult<AiAggregateTaskOption>(await queryAiAggregateTasks({
        pageIndex: 0,
        pageSize: 200,
        terms: [{ column: 'sceneId', termType: 'eq', value: sceneId }],
      }))
      if (requestVersion === aggregateTaskRequestVersion) {
        aggregateTasks.value = result.data.filter(task => task.taskTargets?.some(target => target.value === taskTarget))
      }
    } finally {
      if (requestVersion === aggregateTaskRequestVersion) loadingAggregateTasks.value = false
    }
  }

  onBeforeUnmount(() => {
    if (sceneSearchTimer) clearTimeout(sceneSearchTimer)
  })

  return {
    scenes,
    aggregateTasks,
    loadingScenes,
    loadingAggregateTasks,
    hasMoreScenes,
    taskTargets,
    loadScenes,
    searchScenes,
    loadSelectedScene,
    loadAggregateTasks,
  }
}

const mergeScenes = (current: AiSceneTreeOption[], next: AiSceneTreeOption[]) => {
  const sceneMap = new Map(current.map(scene => [scene.id, scene]))
  next.forEach(scene => sceneMap.set(scene.id, scene))
  return [...sceneMap.values()]
}

const createSceneSearchTerms = (keyword: string) => keyword
  ? [
      { column: 'name', termType: 'like', value: `%${keyword}%`, type: 'or' },
      { column: 'id', termType: 'like', value: `%${keyword}%`, type: 'or' },
    ]
  : []
