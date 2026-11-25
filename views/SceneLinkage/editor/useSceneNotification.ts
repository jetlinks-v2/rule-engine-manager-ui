import { computed, onScopeDispose, reactive, ref, watch, watchEffect } from 'vue'
import { queryNotificationRecipientDirectory, type NotificationRecipient, type NotificationRecipientType } from '@jetlinks-web-core/api/notificationRecipients'
import { useNotificationConfigNavigation } from '@jetlinks-web-core/hooks/useNotificationConfigNavigation'
import { querySceneNotifyChannels, querySceneNotifyChannelTemplates, type SceneNotifyMethod } from '../../../api/scene-linkage'
import { requiresSceneNotifyTemplate, toSceneNotifyMethods } from '../../../utils/sceneNotify'
import type { SceneActionForm, SceneLinkageForm } from '../utils'
import type { SceneNotifyRecipientKind } from './notificationSummary'

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

/** 两种编辑模式共用按需目录、范围选择与重试；切换类型保留其他已选对象。 */
export function useSceneNotifyRecipients(action: () => SceneActionForm, method: () => SceneNotifyMethod | undefined, visible: () => boolean) {
  type Kind = 'people' | NotificationRecipientType
  const kind = ref<Kind>('people')
  const directories = reactive<Record<NotificationRecipientType, { status: 'idle' | 'loading' | 'ready' | 'error'; options: { id: string; name: string }[] }>>({
    org: { status: 'idle', options: [] }, role: { status: 'idle', options: [] },
  })
  const kinds = computed<Kind[]>(() => ['people', ...(method()?.recipientTypes || [])])
  const dimensions = computed<NotificationRecipient[]>(() => action().config?.dimensions || [])
  const scopeNames = computed(() => dimensions.value.map(ref => ({ ...ref,
    name: directories[ref.type]?.options.find(option => option.id === ref.id)?.name
      || (action().options?.recipientScopes as Array<NotificationRecipient & { name?: string }> | undefined)?.find(item => item.type === ref.type && item.id === ref.id)?.name,
  })))
  const directory = computed(() => kind.value === 'people' ? undefined : directories[kind.value])
  const ids = computed(() => dimensions.value.filter(ref => ref.type === kind.value).map(ref => ref.id))
  const options = computed(() => {
    const values = new Map(directory.value?.options.map(option => [option.id, option.name]))
    for (const ref of dimensions.value.filter(ref => ref.type === kind.value)) {
      if (!values.has(ref.id)) values.set(ref.id, (action().options?.recipientScopes as Array<NotificationRecipient & { name?: string }> | undefined)?.find(item => item.type === ref.type && item.id === ref.id)?.name || ref.id)
    }
    return [...values].map(([value, label]) => ({ value, label }))
  })
  let active = true
  onScopeDispose(() => { active = false })
  async function load(type: NotificationRecipientType) {
    const target = directories[type]
    if (target.status === 'loading') return
    target.status = 'loading'
    try {
      const options = await queryNotificationRecipientDirectory(type)
      if (active) { target.options = options; target.status = 'ready' }
    } catch { if (active) target.status = 'error' }
  }
  // 仅有组织/角色的已保存配置重新打开时直接定位到对应选项，不显示空的人员选择。
  watch(() => [visible(), method()?.id], () => {
    if (!visible()) return
    kind.value = action().config?.userIds?.length ? 'people'
      : kinds.value.find(type => dimensions.value.some(ref => ref.type === type)) || 'people'
  }, { immediate: true })
  watchEffect(() => {
    if (!visible()) return
    if (!kinds.value.includes(kind.value)) kind.value = kinds.value[0]
    for (const type of method()?.recipientTypes || []) {
      if (directories[type].status === 'idle' && (kind.value === type || dimensions.value.some(ref => ref.type === type))) void load(type)
    }
  })
  function change(ids: string[]): SceneActionForm {
    const type = kind.value
    if (type === 'people' || !kinds.value.includes(type)) return action()
    const remaining = dimensions.value.filter(ref => ref.type !== type)
    const next = [...remaining, ...ids.map(id => ({ type, id }))]
    const cached: Array<NotificationRecipient & { name?: string }> = action().options?.recipientScopes || []
    return { ...action(), config: { ...action().config, dimensions: next }, options: {
      ...action().options,
      recipientScopes: next.map(ref => ({ ...ref, name: directories[ref.type].options.find(option => option.id === ref.id)?.name || cached.find(item => item.type === ref.type && item.id === ref.id)?.name })),
    } }
  }
  /** 预览移除只改变当前动作、指定类型及 ID，仍由弹窗确定或取消来提交、恢复草稿。 */
  function remove(type: SceneNotifyRecipientKind, id: string): SceneActionForm {
    const current = action()
    if (type === 'people') {
      return { ...current, config: { ...current.config, userIds: (current.config?.userIds || []).filter(userId => userId !== id) } }
    }
    return { ...current,
      config: { ...current.config, dimensions: dimensions.value.filter(ref => ref.type !== type || ref.id !== id) },
      options: { ...current.options, recipientScopes: scopeNames.value.filter(ref => ref.type !== type || ref.id !== id) },
    }
  }
  return { kind, kinds, directory, ids, options, scopeNames, change, remove, retry: () => { if (kind.value !== 'people') void load(kind.value) } }
}
