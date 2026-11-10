import { computed, ref, watch } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { useRequest } from '@jetlinks-web/hooks'
import { queryTags } from '../../../../../api/calendar'

export type TimerCalendarTag = { id: string; name: string }

// 复用选择器原有接口；同一批编辑器/摘要组件共享请求，全部离开后释放字典。
const useCalendarRequest = createSharedComposable(() => {
  const failed = ref(false)
  const { data, loading, run } = useRequest<TimerCalendarTag[], TimerCalendarTag[]>(queryTags, {
    immediate: false, defaultValue: [], onError: () => { failed.value = true }, onWarn: () => { failed.value = true },
  })
  let loaded = false
  let pending: Promise<unknown> | undefined
  async function load() {
    if (loaded) return
    if (pending) return pending
    failed.value = false
    // 查询失败保留明确状态并允许重试；摘要回退为日历条件，不暴露内部标签 ID。
    pending = run().then(() => { loaded = true }).catch(() => { failed.value = true }).finally(() => { pending = undefined })
    return pending
  }
  return { tags: computed(() => data.value || []), loading, failed, load }
})

/** 仅实际出现日历配置时加载名称，切换、编辑、预览共用同一份响应式字典。 */
export function useTimerCalendarTags(enabled: () => boolean) {
  const state = useCalendarRequest()
  watch(enabled, value => { if (value) void state.load() }, { immediate: true })
  return state
}

/** 只检查触发器及其嵌套日程，不遍历或修改执行动作和其他扩展配置。 */
export function hasCalendarTimer(value: Record<string, any> | undefined): boolean {
  if (!value) return false
  if (value.trigger === 'multi') return true
  if (value.type === 'multi') return (value.multi?.triggers || []).some((item: Record<string, any>) => hasCalendarTimer(item.trigger))
  return [value.timer, value.device?.operation?.timer, value.collector?.timer].some(timer => timer?.trigger === 'multi')
}
