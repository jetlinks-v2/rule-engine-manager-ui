import { onScopeDispose, ref } from 'vue'
import { useNotificationConfigNavigation } from '@jetlinks-web-core/hooks/useNotificationConfigNavigation'
import { querySceneNotifyChannels, querySceneNotifyChannelTemplates, type SceneNotifyMethod } from '../../../api/scene-linkage'
import { requiresSceneNotifyTemplate, toSceneNotifyMethods } from '../../../utils/sceneNotify'
import type { SceneActionForm, SceneLinkageForm } from '../utils'

type TemplateState = 'loading' | 'failed' | 'ready'
/** 场景保存协议保持不变；配置刷新仅更新候选和预览，迟到结果不能覆盖新的选择。 */
export function useSceneNotification(form: SceneLinkageForm) {
  const notifyMethods = ref<SceneNotifyMethod[]>([])
  const notifyMethodsLoading = ref(false)
  const notifyMethodsFailed = ref(false)
  const states = ref(new Map<SceneActionForm, TemplateState>())
  const requests = new WeakMap<SceneActionForm, number>()
  let active = true
  let sequence = 0
  async function loadNotifyMethods(force = false) {
    if ((!force && notifyMethods.value.length) || notifyMethodsLoading.value) return
    notifyMethodsLoading.value = true
    notifyMethodsFailed.value = false
    try {
      const response = await querySceneNotifyChannels()
      if (response?.success === false) throw new Error('Notification channels unavailable')
      const result = response?.result ?? response
      const providers = Array.isArray(result) ? result : result?.data
      if (!Array.isArray(providers)) throw new Error('Invalid notification channels')
      if (active) notifyMethods.value = toSceneNotifyMethods(providers)
    } catch { if (active) notifyMethodsFailed.value = true }
    finally { if (active) notifyMethodsLoading.value = false }
  }
  function getTemplateContent(template?: { template?: Record<string, unknown> }) {
    const body = template?.template || {}
    const nested = (value: unknown, key: string) => value && typeof value === 'object'
      ? (value as Record<string, unknown>)[key] : undefined
    return [body.message, body.ttsmessage, body.body, nested(body.text, 'content'), nested(body.markdown, 'text'), nested(body.link, 'text'), body.text]
      .filter((value): value is string => typeof value === 'string').find(Boolean) || ''
  }
  async function refreshNotifyTemplate(index: number, method: SceneNotifyMethod, changed = false) {
    const action = form.actions[index]
    if (!action || action.type !== 'sceneNotify') return
    const current = ++sequence
    requests.set(action, current)
    if (changed) action.config = { ...action.config, notifyChannelIds: [method.id] }
    action.options = { ...action.options, channelName: method.name, templateContent: '' }
    states.value.set(action, 'loading')
    try {
      let templateContent = ''
      if (requiresSceneNotifyTemplate(method.channelProvider)) {
        const response = await querySceneNotifyChannelTemplates(method.providerId)
        if (response?.success === false) throw new Error('Notification template unavailable')
        const detail = response?.result ?? response
        const item = detail?.channels?.find((entry: { channel?: { id?: string } }) => entry.channel?.id === method.id)
        templateContent = getTemplateContent(item?.template)
      }
      if (!active || requests.get(action) !== current || !form.actions.includes(action)) return
      action.options = { ...action.options, channelName: method.name, templateContent }
      states.value.set(action, 'ready')
    } catch {
      if (active && requests.get(action) === current) states.value.set(action, 'failed')
    }
  }
  async function retryNotification(index: number) {
    const action = form.actions[index]
    await loadNotifyMethods(true)
    if (notifyMethodsFailed.value || form.actions[index] !== action) return
    const method = notifyMethods.value.find(item => item.id === action?.config?.notifyChannelIds?.[0])
    if (method) await refreshNotifyTemplate(index, method)
  }
  async function refreshTemplates() {
    await loadNotifyMethods(true)
    if (notifyMethodsFailed.value || !active) return
    await Promise.all(form.actions.map((action, index) => {
      const method = action.type === 'sceneNotify' ? notifyMethods.value.find(item => item.id === action.config?.notifyChannelIds?.[0]) : undefined
      return method ? refreshNotifyTemplate(index, method) : undefined
    }))
  }
  const navigation = useNotificationConfigNavigation(refreshTemplates)
  const configureNotification = (action: SceneActionForm) => navigation.open('scene',
    notifyMethods.value.find(method => method.id === action.config?.notifyChannelIds?.[0])?.channelProvider)
  onScopeDispose(() => { active = false })
  return { notifyMethods, notifyMethodsLoading, notifyMethodsFailed, loadNotifyMethods, refreshNotifyTemplate,
    templateState: (action: SceneActionForm) => states.value.get(action), configureNotification,
    canConfigureNotification: navigation.available, refreshTemplates, retryNotification }
}
