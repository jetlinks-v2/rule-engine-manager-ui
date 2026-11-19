import { computed, onBeforeUnmount, ref } from 'vue'
import {
  queryAiAlarmSceneTree,
  queryAiSceneTree,
  queryAiSceneTreeNoPaging,
  type AiVisualAlarmTaskOption,
  type AiSceneTreeOption,
} from '../../../api/scene-linkage'
import { normalizeResult } from '../utils'
import { loadVisualAlarmTaskPage } from './aiVisualAlarmTaskService'

const SCENE_PAGE_SIZE = 30

/** 为 AI 事件行加载当前用户可访问的场景、算法与摄像头范围。 */
export const useAiEventResources = (sceneMode: 'event' | 'alarm' = 'event') => {
  const scenes = ref<AiSceneTreeOption[]>([])
  const aggregateTasks = ref<AiVisualAlarmTaskOption[]>([])
  const loadingScenes = ref(false)
  const loadingAggregateTasks = ref(false)
  const aggregateTaskLoadFailed = ref(false)
  const hasMoreAggregateTasks = ref(false)
  let aggregateTaskPageIndex = -1
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

  /**
   * Visual-event configuration chooses an algorithm before a camera. It therefore needs the
   * complete scene-package tree instead of a binding-derived subset of paged scene results.
   */
  const loadSceneTree = async () => {
    const requestVersion = ++sceneRequestVersion
    loadingScenes.value = true
    try {
      const tree = normalizeResult<AiSceneTreeOption>(await queryAiSceneTreeNoPaging())
      if (requestVersion !== sceneRequestVersion) return
      scenes.value = tree.data
      scenePageIndex.value = 0
      sceneTotal.value = tree.total
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

  const loadAggregateTasks = async (sceneId?: string, taskTarget?: string, selectedId?: string, append = false) => {
    if (append && (loadingAggregateTasks.value || !hasMoreAggregateTasks.value)) return
    const requestVersion = ++aggregateTaskRequestVersion
    if (!sceneId || !taskTarget) {
      aggregateTasks.value = []
      hasMoreAggregateTasks.value = false
      aggregateTaskLoadFailed.value = false
      loadingAggregateTasks.value = false
      return
    }
    loadingAggregateTasks.value = true
    aggregateTaskLoadFailed.value = false
    if (!append) { aggregateTasks.value = []; hasMoreAggregateTasks.value = false }
    try {
      const pageIndex = append ? aggregateTaskPageIndex + 1 : 0
      const result = await loadVisualAlarmTaskPage(pageIndex, { sceneId, taskTarget }, selectedId)
      if (requestVersion === aggregateTaskRequestVersion) {
        const tasks = result.data.map(task => ({ ...task, taskTargets: task.taskTargets.map(target => ({ ...target,
          text: taskTargets.value(sceneId).find(option => option.value === target.value)?.text || target.value,
        })) }))
        aggregateTasks.value = [...new Map([...(append ? aggregateTasks.value : []), ...tasks].map(task => [task.id, task])).values()]
        aggregateTaskPageIndex = pageIndex
        hasMoreAggregateTasks.value = result.hasMore
      }
    } catch {
      if (requestVersion === aggregateTaskRequestVersion) aggregateTaskLoadFailed.value = true
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
    aggregateTaskLoadFailed,
    hasMoreAggregateTasks,
    hasMoreScenes,
    taskTargets,
    loadScenes,
    loadSceneTree,
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
