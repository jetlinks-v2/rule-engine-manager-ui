import { onScopeDispose, watch } from 'vue'

/** 合并已确认的样本修改；调用方负责真实执行、错误反馈及过期结果隔离。 */
export function useAutoSimulation(options: { execute:() => Promise<void>; allowed:() => boolean; active:() => boolean }) {
  let timer:ReturnType<typeof setTimeout> | undefined
  let running:Promise<void> | undefined
  let pending:'auto' | 'manual' | undefined
  let disposed = false
  function clearTimer() { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  function cancel() { clearTimer(); pending = undefined }
  function flush():Promise<void> {
    if (disposed || !options.allowed() || pending === 'auto' && !options.active()) { cancel(); return Promise.resolve() }
    if (running || timer !== undefined || !pending) return running || Promise.resolve()
    pending = undefined
    running = options.execute().finally(() => {
      running = undefined
      if (!disposed && pending && timer === undefined) void flush()
    })
    return running
  }
  function schedule() {
    if (disposed || !options.allowed() || !options.active()) { cancel(); return }
    clearTimer()
    if (pending !== 'manual') pending = 'auto'
    timer = setTimeout(() => { timer = undefined; void flush() }, 500)
  }
  function run() {
    clearTimer(); pending = 'manual'
    return flush()
  }
  watch([options.allowed, options.active], ([allowed, active]) => {
    if (!allowed || !active && pending === 'auto') cancel()
  }, { flush:'sync' })
  onScopeDispose(() => { disposed = true; cancel() })
  return { schedule, run, cancel }
}
