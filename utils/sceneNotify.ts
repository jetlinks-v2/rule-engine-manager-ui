import type { SceneNotifyConfig, SceneNotifyMethod } from '../api/scene-linkage'

export const INSIDE_MAIL_CHANNEL_PROVIDER = 'inside-mail'

type SceneNotifyChannel = {
  id?: string
  name?: string
  channelProvider?: string
  channelConfiguration?: { notifierId?: string; templateId?: string }
}

type SceneNotifyProvider = {
  id?: string
  provider?: string
  channels?: SceneNotifyChannel[]
}

export function isSupportedSceneNotifyChannel(channelProvider?: string): boolean {
  return channelProvider === INSIDE_MAIL_CHANNEL_PROVIDER
    || channelProvider === 'inbox'
    || Boolean(channelProvider?.startsWith('notifier-'))
}

export function requiresSceneNotifyTemplate(channelProvider?: string): boolean {
  return Boolean(channelProvider?.startsWith('notifier-'))
}

/** 固定目标能力来自与视觉告警共用的凭据规则；Webhook 保留内置固定语义。 */
export function requiresSceneNotifyRecipients(method?: SceneNotifyMethod): boolean {
  return !method?.fixedRecipient && method?.channelProvider !== 'notifier-webhook'
}

/** 编辑弹窗、快速模式和详细模式统一使用渠道的收信人规则。 */
export function isSceneNotifyConfigured(config: SceneNotifyConfig | null = {}, methods: SceneNotifyMethod[] = []): boolean {
  const ids = config?.notifyChannelIds || []
  return ids.length > 0 && ids.every(id => {
    const method = methods.find(method => method.id === id)
    if (!requiresSceneNotifyRecipients(method)) return Boolean(method?.templateId)
    return Boolean(config?.userIds?.length || config?.dimensions?.some(ref => ref.id?.trim() && method?.recipientTypes?.includes(ref.type)))
  })
}

export function toSceneNotifyMethods(providers: SceneNotifyProvider[]): SceneNotifyMethod[] {
  return providers
    .filter(provider => provider.provider === 'scene')
    .flatMap(provider => (provider.channels || []).map(channel => ({
      id: channel.id || '',
      providerId: provider.id || provider.provider || '',
      name: channel.name || channel.channelProvider || '',
      channelProvider: channel.channelProvider || '',
      ...(channel.channelConfiguration?.notifierId ? { notifierId: channel.channelConfiguration.notifierId } : {}),
      ...(channel.channelConfiguration?.templateId ? { templateId: channel.channelConfiguration.templateId } : {}),
      ...(channel.channelProvider === 'notifier-webhook' ? { fixedRecipient: true } : {}),
    })))
    .filter(method => Boolean(
      method.id
      && method.providerId
      && isSupportedSceneNotifyChannel(method.channelProvider),
    ))
}

/** 切换渠道时清除不支持的范围及固定目标，避免隐藏配置继续参与投递。 */
export function changeSceneNotifyMethod(config: SceneNotifyConfig = {}, method: SceneNotifyMethod) {
  const dimensions = (config.dimensions || []).filter((ref) => method.recipientTypes?.includes(ref.type))
  return {
    ...config, notifyChannelIds: [method.id],
    userIds: requiresSceneNotifyRecipients(method) ? config.userIds || [] : [],
    dimensions: requiresSceneNotifyRecipients(method) ? dimensions : [],
    useThirdPartyRelation: Boolean(method.recipientTypes?.length),
  }
}
