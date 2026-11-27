import { computed, nextTick, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, triggerRef, watch, type Ref } from 'vue'
import { useDocumentVisibility, useElementSize, useScroll, useTimestamp } from '@vueuse/core'
import { Subscription, retry, switchMap, tap, timer } from 'rxjs'
import { observeRuleInstances, streamRuleInstances, type RuleListCursor, type RuleListQuery } from '../../api/instanceObservation'
import { ruleListWindow, type RuleListItem, type RuleRuntimeFrame } from './listTypes'
import { useRulePreviews } from './useRulePreviews'

/** One bounded list reader and one visible-scope observation subscription per page. */
export function useRuleInstanceList(suspended: Ref<boolean> = ref(false)) {
  const viewport = ref<HTMLElement>()
  const { width, height } = useElementSize(viewport)
  const { y } = useScroll(viewport, { throttle: 80 })
  const active = ref(true)
  const visibility = useDocumentVisibility()
  const items = shallowRef<RuleListItem[]>([])
  const loading = ref(false)
  const error = ref(false)
  const more = ref(true)
  const query = shallowRef<RuleListQuery>({ terms: [] })
  const searchTerms = computed(() => query.value.terms || [])
  let cursor: RuleListCursor | undefined
  let reader: Subscription | undefined
  let generation = 0
  const layout = computed(() => ruleListWindow(items.value.length, width.value, height.value, y.value))
  const visibleItems = computed(() => items.value.slice(layout.value.start, layout.value.end))
  const observing = computed(() => active.value && visibility.value === 'visible' && !suspended.value)
  const previews = useRulePreviews(visibleItems, observing)
  const frame = shallowRef<RuleRuntimeFrame>()
  const observationFailed = ref(false)
  const observationPending = computed(() => !frame.value && !observationFailed.value)
  const receivedAt = ref(0)
  const { timestamp: now, pause, resume } = useTimestamp({ controls: true, interval: 1000 })
  const stale = computed(() => !receivedAt.value || now.value - receivedAt.value > 15000)
  const runtime = computed(() => new Map(frame.value?.rules.map(info => [info.id, info])))

  function loadMore() {
    if (loading.value || !more.value || !active.value) return
    const identity = generation
    loading.value = true
    error.value = false
    let count = 0
    let last: RuleListItem | undefined
    // Only publish a cursor after the segment completes: a failed stream is safely retried and deduplicated.
    const seen = new Set(items.value.map(item => item.id))
    reader = streamRuleInstances(query.value, cursor).subscribe({
      next(item) {
        if (identity !== generation) return
        count++
        last = item
        if (!seen.has(item.id)) {
          seen.add(item.id)
          items.value.push(item)
          triggerRef(items)
        }
      },
      error() {
        if (identity !== generation) return
        loading.value = false
        error.value = true
      },
      complete() {
        if (identity !== generation) return
        if (last) cursor = { beforeTime: last.createTime, beforeId: last.id }
        more.value = count === 32
        loading.value = false
        void nextTick(checkTail)
      },
    })
  }

  function checkTail() {
    if (observing.value && !error.value && layout.value.height - y.value - height.value < 480) loadMore()
  }

  function refresh(filter: RuleListQuery = query.value) {
    generation++
    reader?.unsubscribe()
    loading.value = false
    query.value = filter
    cursor = undefined
    more.value = true
    error.value = false
    items.value = []
    frame.value = undefined
    if (viewport.value) viewport.value.scrollTop = 0
    y.value = 0
    loadMore()
  }

  watch([y, height, observing], checkTail)
  // Discard off-screen observations instead of keeping a metrics map for every loaded rule.
  watch(() => observing.value ? visibleItems.value.filter(item => item.state?.value === 'started').map(item => item.id).join(',') : '', (scope, _, cleanup) => {
    frame.value = undefined
    receivedAt.value = 0
    observationFailed.value = false
    if (!scope) return
    // NDJSON can deliver rows in separate microtasks; coalesce scope changes before opening a server sampler.
    const subscription = timer(100).pipe(switchMap(() => observeRuleInstances(scope.split(','))),
      tap({ error: () => { observationFailed.value = true } }),
      retry({ delay: (_error, attempt) => timer(Math.min(1000 * 2 ** Math.min(attempt, 3), 10000)) }),
    ).subscribe(value => {
      frame.value = value
      receivedAt.value = Date.now()
      observationFailed.value = false
    })
    cleanup(() => subscription.unsubscribe())
  }, { immediate: true })
  watch(observing, value => { if (value) resume(); else pause() }, { immediate: true })
  onActivated(() => { active.value = true; if (!items.value.length) loadMore() })
  onDeactivated(() => { active.value = false; reader?.unsubscribe(); loading.value = false })
  onScopeDispose(() => { generation++; reader?.unsubscribe() })

  return { viewport, items, searchTerms, visibleItems, layout, loading, error, more, runtime, stale, now, previews,
    observationFailed, observationPending, refresh, loadMore }
}
