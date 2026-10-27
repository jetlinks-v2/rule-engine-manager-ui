import { onScopeDispose, shallowRef, type Component } from 'vue'
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'

/** 通过公开注册资源复用概览流程，模块晚注册或卸载时同步更新，不依赖其私有文件。 */
export function useAlarmHandlingEntry() {
  const entry = shallowRef<Component>()
  const sync = () => { entry.value = moduleRegistry.getResourceItem<Component>('authentication-manager-ui', 'components', 'QuickAlarmEntry') }
  const stop = moduleRegistry.onChange(sync)
  sync()
  onScopeDispose(stop)
  return entry
}
