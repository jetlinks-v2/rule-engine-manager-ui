import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import { allAlarmCapabilities, type AlarmCapabilities } from '../dashboard.types'

interface GrantedMenu { code?: string; children?: GrantedMenu[] }

/** 页面与独立卡片共用运行态模块及服务端菜单，隐藏路由不授予统计能力。 */
export function useAlarmCapabilities(preview: Readonly<Ref<boolean>>) {
  const menu = useMenuStore()
  const revision = ref(0)
  onScopeDispose(moduleRegistry.onChange(() => { revision.value++ }))
  return computed<AlarmCapabilities>(() => {
    if (preview.value) return { ...allAlarmCapabilities }
    void revision.value
    const ready = menu.initialized && !menu.loading
    const codes = new Set<string>()
    const collect = (items: readonly GrantedMenu[]) => {
      for (const item of items) {
        if (item.code) codes.add(item.code)
        if (item.children) collect(item.children)
      }
    }
    if (ready) collect(menu.menuResultCache)
    const installed = ready && moduleRegistry.hasModule('jetlinks-ai-ui')
    const vision = installed && codes.has('machine-vision/VisualAlarm')
    return { ready, vision, events: installed && (vision || codes.has('video/event') || codes.has('project/video/event')) }
  })
}
