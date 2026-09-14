import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { querySceneContextRecords, querySceneRecordsByScene } from '../../../api/scene-linkage'
import { normalizeResult } from '../utils'

export interface SceneExecutionRecord {
  id: string
  contextId?: string
  createTime?: number | string
  timestamp?: number | string
  nodeName?: string
  action?: string | { value?: string, text?: string }
  useNanos?: number | string
  hasError?: boolean
  errorDetail?: string
}

export interface SceneExecutionRecordState {
  records: SceneExecutionRecord[]
  total: number
  loading: boolean
  loadError: boolean
  expandedContextId: string
  detailLoading: boolean
  detailError: boolean
  detailRecords: SceneExecutionRecord[]
}

/**
 * 管理单个场景的执行批次与节点日志。
 *
 * 抽屉关闭或快速切换场景时，通过请求版本忽略已过期的响应，避免旧场景日志覆盖当前抽屉。
 */
export function useSceneExecutionRecords() {
  const sceneId = ref('')
  const records = ref<SceneExecutionRecord[]>([])
  const total = ref(0)
  const pageIndex = ref(0)
  const loading = ref(false)
  const loadError = ref(false)
  const expandedContextId = ref('')
  const expandedRecord = ref<SceneExecutionRecord>()
  const detailLoading = ref(false)
  const detailError = ref(false)
  const detailRecords = ref<SceneExecutionRecord[]>([])
  let listRequestVersion = 0
  let detailRequestVersion = 0
  const pageSize = 10

  const state = computed<SceneExecutionRecordState>(() => ({
    records: records.value,
    total: total.value,
    loading: loading.value,
    loadError: loadError.value,
    expandedContextId: expandedContextId.value,
    detailLoading: detailLoading.value,
    detailError: detailError.value,
    detailRecords: detailRecords.value,
  }))

  function reset() {
    records.value = []
    total.value = 0
    pageIndex.value = 0
    loadError.value = false
    expandedContextId.value = ''
    expandedRecord.value = undefined
    detailRecords.value = []
    detailError.value = false
    detailRequestVersion += 1
  }

  /** 打开指定场景的日志，并从最新执行批次重新加载。 */
  async function open(id: string) {
    sceneId.value = id
    reset()
    await reload()
  }

  /** 继续使用当前分页条件加载执行批次，供首次加载和“加载更多”共用。 */
  async function reload() {
    const requestVersion = ++listRequestVersion
    const currentSceneId = sceneId.value
    if (!currentSceneId) return

    loading.value = true
    loadError.value = false
    try {
      const result = normalizeResult<SceneExecutionRecord>(await querySceneRecordsByScene(currentSceneId, {
        pageIndex: pageIndex.value,
        pageSize,
        sorts: [{ name: 'createTime', order: 'desc' }],
      }))
      if (requestVersion !== listRequestVersion) return
      records.value = pageIndex.value ? [...records.value, ...result.data] : result.data
      total.value = result.total
    } catch {
      if (requestVersion === listRequestVersion) loadError.value = true
    } finally {
      if (requestVersion === listRequestVersion) loading.value = false
    }
  }

  function loadMore() {
    pageIndex.value += 1
    void reload()
  }

  async function toggleRecord(record: SceneExecutionRecord) {
    if (!record.contextId) return
    if (expandedContextId.value === record.contextId) {
      // 收起时也推进版本号，避免尚未返回的详情请求回写到后续重新打开的记录。
      detailRequestVersion += 1
      expandedContextId.value = ''
      expandedRecord.value = undefined
      detailRecords.value = []
      detailError.value = false
      return
    }

    expandedContextId.value = record.contextId
    expandedRecord.value = record
    await loadDetail(record)
  }

  async function retryDetail() {
    if (expandedRecord.value) await loadDetail(expandedRecord.value)
  }

  async function loadDetail(record: SceneExecutionRecord) {
    if (!record.contextId || !sceneId.value) return

    const requestVersion = ++detailRequestVersion
    const currentSceneId = sceneId.value
    detailLoading.value = true
    detailError.value = false
    detailRecords.value = []
    try {
      const result = normalizeResult<SceneExecutionRecord>(await querySceneContextRecords(currentSceneId, record.contextId, {
        paging: false,
        sorts: [{ name: 'createTime', order: 'asc' }],
      }))
      if (requestVersion === detailRequestVersion) detailRecords.value = result.data
    } catch {
      if (requestVersion === detailRequestVersion) detailError.value = true
    } finally {
      if (requestVersion === detailRequestVersion) detailLoading.value = false
    }
  }

  return {
    state,
    open,
    reload,
    loadMore,
    toggleRecord,
    retryDetail,
  }
}

export function formatSceneExecutionTime(value: unknown) {
  const time = Number(value)
  return Number.isFinite(time) ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : String(value || '-')
}

/** 将服务端纳秒耗时压缩为日志中便于浏览的时间单位。 */
export function formatSceneExecutionDuration(value: unknown) {
  const nanoseconds = Number(value)
  if (!Number.isFinite(nanoseconds) || nanoseconds < 0) return '-'

  const unit = nanoseconds >= 1_000_000_000
    ? { divisor: 1_000_000_000, label: 's' }
    : nanoseconds >= 1_000_000
      ? { divisor: 1_000_000, label: 'ms' }
      : nanoseconds >= 1_000
        ? { divisor: 1_000, label: 'μs' }
        : { divisor: 1, label: 'ns' }

  return `${Number((nanoseconds / unit.divisor).toPrecision(3))} ${unit.label}`
}
