import type { SceneNotifyMethod, SceneNotifyUser } from '../../../api/scene-linkage'

type NotifyConfig = { userIds?: string[]; notifyChannelIds?: string[] }
type NotifyOptions = { channelName?: string; methodName?: string; notifyChannelName?: string; userNames?: string[] | string; recipientNames?: string[] | string; users?: Array<{ id: string; name: string } | string> }
type Translate = (key: string, values?: Record<string, string | number>) => string

/** 两种编辑模式共用通知显示口径；名称不可用时回退人数，不向用户展示内部 ID。 */
export function getNotificationSummary(config: NotifyConfig = {}, options: NotifyOptions = {}, t: Translate, users: SceneNotifyUser[] = [], methods: SceneNotifyMethod[] = []) {
  const ids = config.userIds || []
  const rawNames = options.userNames || options.recipientNames
  const cachedNames = Array.isArray(rawNames) ? rawNames : rawNames && ids.length === 1 ? [rawNames] : []
  const cachedUsers = Array.isArray(options.users) ? options.users.filter((user): user is { id: string; name: string } => Boolean(user) && typeof user === 'object') : []
  const selectedNames = ids.map((id, index) => users.find(user => String(user.id) === String(id))?.name
    || cachedUsers.find(user => String(user.id) === String(id))?.name
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
