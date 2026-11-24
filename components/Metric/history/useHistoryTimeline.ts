import { computed, ref, watch, type Ref } from 'vue'
import { historyBounds, historyGroup, type HistoryEntry } from './projection'
import { metricHistoryKind } from '../presentation'
import type { MetricValue } from '../types'

/** Empty refresh frames retain the observed type; the consumer's scope key resets it when the output or target changes. */
export function useHistoryKind(values:Ref<MetricValue[]>, current:Ref<MetricValue | undefined>, scope?:Ref<string>) {
  const kind = ref<ReturnType<typeof metricHistoryKind>>('other')
  let previousScope:string | undefined
  watch([values, current, () => scope?.value], () => {
    if (previousScope !== scope?.value) { kind.value = 'other'; previousScope = scope?.value }
    if (values.value.some(value => value.value != null)) kind.value = metricHistoryKind(values.value)
    else if (current.value?.value != null) kind.value = metricHistoryKind([current.value])
  }, { immediate:true })
  return kind
}

/** Local read-only selection: preserve pinned identity through refresh, and report eviction rather than silently replacing it. */
export function useHistoryTimeline(entries: Ref<HistoryEntry[]>, bounds: Ref<[number, number] | undefined>) {
  const selectedKey = ref<string>()
  const hoverKey = ref<string>()
  const filter = ref<string>()
  const focused = ref(false)
  const zoom = ref<[number,number]>()
  const visible = computed(() => filter.value === undefined ? entries.value : entries.value.filter(entry => historyGroup(entry) === filter.value))
  const fullAxis = computed(() => historyBounds(entries.value, bounds.value))
  const pinned = computed(() => selectedKey.value !== undefined)
  const selected = computed(() => pinned.value ? entries.value.find(entry => entry.key === selectedKey.value) : visible.value.at(-1))
  const hovered = computed(() => entries.value.find(entry => entry.key === hoverKey.value))
  const detail = computed(() => pinned.value ? selected.value : hovered.value || selected.value)
  const missing = computed(() => pinned.value && !selected.value)
  const axis = computed(() => {
    const full = fullAxis.value, entry = selected.value
    if(zoom.value) return historyBounds([],zoom.value)
    if (!focused.value || !full || !entry || entry.kind !== 'interval') return full
    const margin = Math.max(120000,(entry.end-entry.time)/4)
    return historyBounds([], [Math.max(full[0],entry.time-margin),Math.min(full[1],entry.end+margin)]) || full
  })
  const position = computed(() => visible.value.findIndex(entry => entry.key === detail.value?.key))
  const groups = computed(() => {
    const values = new Map<string, { key:string; entry:HistoryEntry; count:number }>()
    for (const entry of entries.value) {
      const key = historyGroup(entry), group = values.get(key)
      if (group) group.count++
      else values.set(key, { key, entry, count:1 })
    }
    return [...values.values()]
  })
  watch([entries, bounds], () => { hoverKey.value = undefined })
  function choose(entry:HistoryEntry) { selectedKey.value = entry.key; hoverKey.value = undefined }
  function setZoom(value?:[number,number]) { zoom.value=value;focused.value=false;hoverKey.value=undefined }
  function focus(value:boolean) { focused.value=value;zoom.value=undefined;hoverKey.value=undefined }
  function hover(entry?:HistoryEntry) { hoverKey.value = entry?.key }
  function chooseFilter(key?:string) {
    filter.value = key
    hoverKey.value = undefined
    selectedKey.value = visible.value.at(-1)?.key
  }
  function move(delta:number) {
    const index = position.value < 0 ? (delta < 0 ? visible.value.length : -1) : position.value
    const entry = visible.value[Math.max(0, Math.min(visible.value.length - 1, index + delta))]
    if (entry) choose(entry)
  }
  function clear() {
    selectedKey.value = undefined
    hoverKey.value = undefined
    if (filter.value !== undefined && !visible.value.length) filter.value = undefined
  }
  /** Navigation only handles timeline keys; page scrolling and other inputs retain their normal behavior. */
  function keydown(event:KeyboardEvent) {
    if (['ArrowLeft','ArrowRight','Escape','Home','End'].includes(event.key)) event.stopPropagation?.()
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1) }
    else if (event.key === 'Escape') { event.preventDefault(); clear() }
    else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const entry = event.key === 'Home' ? visible.value[0] : visible.value.at(-1)
      if (entry) choose(entry)
    }
  }
  return { axis, fullAxis, focused, groups, visible, filter, pinned, selected, hovered, detail, missing, position,
    chooseFilter, choose, move, clear, keydown, hover, setZoom, focus, leave:() => { hoverKey.value = undefined } }
}
