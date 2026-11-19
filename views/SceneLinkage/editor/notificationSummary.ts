import type { SceneNotifyMethod, SceneNotifyUser } from '../../../api/scene-linkage'

type NotifyConfig = { userIds?: string[]; notifyChannelIds?: string[] }
type NotifyOptions = { channelName?: string; methodName?: string; notifyChannelName?: string; userNames?: string[] | string; recipientNames?: string[] | string; users?: Array<{ id: string; name?: string; username?: string } | string> }
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

/** 两种编辑模式共用通知显示口径；名称不可用时回退人数，不向用户展示内部 ID。 */
export function getNotificationSummary(config: NotifyConfig = {}, options: NotifyOptions = {}, t: Translate, users: SceneNotifyUser[] = [], methods: SceneNotifyMethod[] = []) {
  const ids = config.userIds || []
  const rawNames = options.userNames || options.recipientNames
  const cachedNames = Array.isArray(rawNames) ? rawNames : rawNames && ids.length === 1 ? [rawNames] : []
  const cachedUsers = Array.isArray(options.users) ? options.users.filter((user): user is { id: string; name?: string; username?: string } => Boolean(user) && typeof user === 'object') : []
  const selectedNames = ids.map((id, index) => notificationRecipientName(users.find(user => String(user.id) === String(id)))
    || notificationRecipientName(cachedUsers.find(user => String(user.id) === String(id)))
    || (cachedNames.length === ids.length ? cachedNames[index] : undefined))
  const names = selectedNames.filter((name): name is string => Boolean(name))
  const missing = ids.length - names.length
  if (missing) names.push(t('IotSceneLinkage.detail.previewRecipientCount', { count: missing }))
  const channelNames = (config.notifyChannelIds || []).map(id => methods.find(method => String(method.id) === String(id))?.name).filter(Boolean)
  return {
    method: channelNames.length ? channelNames.join('、') : options.channelName || options.methodName || options.notifyChannelName || t('IotSceneLinkage.action.notify'),
    recipients: names.length ? names : [t('IotSceneLinkage.detailNotify.unconfigured')],
  }
}
