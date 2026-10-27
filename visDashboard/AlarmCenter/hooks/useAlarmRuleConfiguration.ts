import { computed, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@jetlinks-web-core/store/user'
import { getProjectCodeFromLocation } from '@jetlinks-web-core/utils/project-runtime'
import { getRequestBaseApi } from '@jetlinks-web-core/utils/request-context'
import { createAlarmDashboardApi } from '../../../api/alarmDashboard'
import { loadRuleConfiguration, pendingConfiguration, ruleSources, type AlarmConfigurationState } from '../services/configuration'

interface ConfigurationEntry {
  state: Ref<AlarmConfigurationState>
  consumers: number
  refresh: () => Promise<void>
  dispose: () => void
}
// 仅共享仍挂载的同作用域消费者；最后一个消费者离开即销毁，不持久化业务配置结果。
const scopes = new Map<string, ConfigurationEntry>()

function createEntry(): ConfigurationEntry {
  const state = shallowRef(pendingConfiguration())
  const api = createAlarmDashboardApi()
  let controller: AbortController | undefined
  let pending: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const entry: ConfigurationEntry = { state, consumers: 0, refresh, dispose }

  /** 同批刷新只发两次请求；迟到响应不得恢复已销毁或切换项目的配置状态。 */
  function refresh(): Promise<void> {
    if (pending) return pending
    clearTimeout(timer)
    controller = new AbortController()
    const signal = controller.signal
    state.value = pendingConfiguration()
    pending = Promise.all(ruleSources.map(async source => {
      const status = await loadRuleConfiguration(api, source, signal)
      if (!signal.aborted) state.value = { ...state.value, [source]: status }
    })).then(() => undefined).catch(() => {
      // 取消不回写结果；意外失败也必须保留明确错误态，不能当成没有规则。
      if (!signal.aborted) state.value = { iot: 'error', vision: 'error' }
    }).finally(() => {
      pending = undefined
      if (!signal.aborted && entry.consumers) timer = setTimeout(() => { void refresh() }, 60_000)
    })
    return pending
  }

  function dispose() {
    controller?.abort()
    clearTimeout(timer)
  }
  return entry
}

/** 按账号、项目和接口隔离配置检测；编辑预览零请求，离开 / 返回页面时重新检测。 */
export function useAlarmRuleConfiguration(preview: Ref<boolean>) {
  const user = useUserStore()
  const route = useRoute()
  const active = ref(true)
  const entry = shallowRef<ConfigurationEntry>()
  const scope = computed(() => JSON.stringify([
    user.userInfo.id, route.params.projectId, route.query.projectId, route.path,
    getProjectCodeFromLocation(), getRequestBaseApi(),
  ]))
  let release: (() => void) | undefined
  const stop = watch([scope, preview, active], ([key, editing, enabled]) => {
    release?.()
    release = undefined
    entry.value = undefined
    if (editing || !enabled) return
    const current = scopes.get(key) || createEntry()
    scopes.set(key, current)
    current.consumers += 1
    entry.value = current
    release = () => {
      current.consumers -= 1
      if (!current.consumers) {
        current.dispose()
        scopes.delete(key)
      }
    }
    if (current.consumers === 1) void current.refresh()
  }, { immediate: true, flush: 'sync' })
  onActivated(() => { active.value = true })
  onDeactivated(() => { active.value = false })
  onScopeDispose(() => { stop(); release?.() })
  return {
    state: computed(() => entry.value?.state.value || pendingConfiguration()),
    refresh: () => entry.value?.refresh() || Promise.resolve(),
  }
}
