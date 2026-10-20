import { computed, type Ref } from 'vue'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import type { AlarmQuickAction } from '../dashboard.types'

const targets = [
  { key: 'iotRules', icon: 'BellOutlined', menus: ['iot-user/device/alarm', 'rule-engine/Alarm/Configuration'] },
  { key: 'visionRules', icon: 'EyeOutlined', menus: ['machine-vision/VisualAlarm'] },
  { key: 'templates', icon: 'FileTextOutlined', menus: ['notice/template'] },
  { key: 'channels', icon: 'SendOutlined', menus: ['notice/channel'] },
]

/** 可见入口来自当前项目菜单；设计预览显示全部入口但不执行导航。 */
export function useAlarmQuickStart(preview: Ref<boolean>) {
  const menu = useMenuStore()
  const resolve = (item: typeof targets[number]) => item.menus.find(code => Boolean(menu.getMenu(code)))
  const actions = computed<AlarmQuickAction[]>(() => targets
    .filter(item => preview.value || resolve(item))
    .map(item => ({ key: item.key, icon: item.icon, disabled: preview.value })))
  function open(key: string) {
    if (preview.value) return
    const item = targets.find(action => action.key === key)
    const code = item && resolve(item)
    if (code) menu.jumpPage(code)
  }
  return { actions, open }
}

