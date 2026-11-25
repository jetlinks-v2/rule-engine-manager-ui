import type { NotificationRecipient, SceneNotifyMethod, SceneNotifyUser } from '../../../api/scene-linkage'
import { requiresSceneNotifyRecipients } from '../../../utils/sceneNotify'

type NotifyConfig = { userIds?: string[]; notifyChannelIds?: string[]; dimensions?: NotificationRecipient[] }
type NotifyOptions = { recipientScopes?: Array<NotificationRecipient & { name?: string }>; channelName?: string; methodName?: string; notifyChannelName?: string; fixedRecipient?: boolean; userNames?: string[] | string; recipientNames?: string[] | string; users?: Array<{ id: string; name?: string; username?: string } | string> }
type Translate = (key: string, values?: Record<string, string | number>) => string

/** 联系方式属于通知配置，不作为收信人的显示名称。 */
export function formatNotificationRecipient(user?: { name?: string; username?: string }) {
  const name = user?.name?.trim() || ''
  const username = user?.username?.trim() || ''
  return name && username ? `${name}（${username}）` : name || username
}

function notificationRecipientName(user?: { name?: string; username?: string }) {
  return user?.name?.trim() || user?.username?.trim() || ''
}

export type SceneNotifyRecipientKind = 'people' | NotificationRecipient['type']

function selectedNotificationUsers(config: NotifyConfig, options: NotifyOptions, users: SceneNotifyUser[]) {
  const ids = config.userIds || []
  const rawNames = options.userNames || options.recipientNames
  const cachedNames = Array.isArray(rawNames) ? rawNames : rawNames && ids.length === 1 ? [rawNames] : []
  const cachedUsers = Array.isArray(options.users) ? options.users.filter((user): user is { id: string; name?: string; username?: string } => Boolean(user) && typeof user === 'object') : []
  return ids.map((id, index) => ({ id, name: notificationRecipientName(users.find(user => String(user.id) === String(id)))
    || notificationRecipientName(cachedUsers.find(user => String(user.id) === String(id)))
    || (cachedNames.length === ids.length ? cachedNames[index] : undefined) }))
}

/** 编辑预览按原生目标类别分组，保留类型和 ID，移除同名或同 ID 对象时不会串改其他类型。 */
export function getNotificationRecipientGroups(config: NotifyConfig, options: NotifyOptions, t: Translate, users: SceneNotifyUser[] = []) {
  const members = selectedNotificationUsers(config, options, users).map(user => ({
    id: user.id, name: user.name || t('IotSceneLinkage.detail.previewRecipientCount', { count: 1 }),
  }))
  return (['org', 'people', 'role'] as const).map(type => ({
    type,
    items: type === 'people' ? members : (config.dimensions || []).filter(ref => ref.type === type).map(ref => ({
      id: ref.id,
      name: options.recipientScopes?.find(item => item.type === type && item.id === ref.id)?.name
        || t('IotSceneLinkage.recipient.scopeCount', { count: 1 }),
    })),
  })).filter(group => group.items.length)
}

/** 两种编辑模式共用通知显示口径；名称不可用时回退人数，不向用户展示内部 ID。 */
export function getNotificationSummary(config: NotifyConfig = {}, options: NotifyOptions = {}, t: Translate, users: SceneNotifyUser[] = [], methods: SceneNotifyMethod[] = []) {
  const ids = config.userIds || []
  const selectedNames = selectedNotificationUsers(config, options, users).map(user => user.name)
  const names = selectedNames.filter((name): name is string => Boolean(name))
  const missing = ids.length - names.length
  if (missing) names.push(t('IotSceneLinkage.detail.previewRecipientCount', { count: missing }))
  for (const ref of config.dimensions || []) {
    const name = options.recipientScopes?.find(item => item.type === ref.type && item.id === ref.id)?.name
    names.push(t('IotSceneLinkage.recipient.' + ref.type) + '：' + (name || t('IotSceneLinkage.recipient.scopeCount', { count: 1 })))
  }
  const channelNames = (config.notifyChannelIds || []).map(id => methods.find(method => String(method.id) === String(id))?.name).filter(Boolean)
  const fixedRecipient = Boolean(config.notifyChannelIds?.length) && config.notifyChannelIds!.every(id => {
    const method = methods.find(method => method.id === id)
    return method ? !requiresSceneNotifyRecipients(method) : options.fixedRecipient === true
  })
  return {
    method: channelNames.length ? channelNames.join('、') : options.channelName || options.methodName || options.notifyChannelName || t('IotSceneLinkage.action.notify'),
    recipients: fixedRecipient ? [] : names.length ? names : [t('IotSceneLinkage.detailNotify.unconfigured')],
    ...(fixedRecipient ? { fixedRecipient: true } : {}),
  }
}
