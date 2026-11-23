import type { SceneNotifyMethod } from '../api/scene-linkage'

export const INSIDE_MAIL_CHANNEL_PROVIDER = 'inside-mail'

type SceneNotifyChannel = {
  id?: string
  name?: string
  channelProvider?: string
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

/** 场景后端仅 Webhook 支持无用户投递；不能直接复用视觉告警的群机器人发送语义。 */
export function requiresSceneNotifyRecipients(method?: SceneNotifyMethod): boolean {
  return method?.channelProvider !== 'notifier-webhook'
}

/** 编辑弹窗、快速模式和详细模式统一使用渠道的收信人规则。 */
export function isSceneNotifyConfigured(config: { notifyChannelIds?: string[], userIds?: string[] } | null = {}, methods: SceneNotifyMethod[] = []): boolean {
  const ids = config?.notifyChannelIds || []
  return ids.length > 0 && (Boolean(config?.userIds?.length)
    || ids.every(id => !requiresSceneNotifyRecipients(methods.find(method => method.id === id))))
}

export function toSceneNotifyMethods(providers: SceneNotifyProvider[]): SceneNotifyMethod[] {
  return providers
    .filter(provider => provider.provider === 'scene')
    .flatMap(provider => (provider.channels || []).map(channel => ({
      id: channel.id || '',
      providerId: provider.id || provider.provider || '',
      name: channel.name || channel.channelProvider || '',
      channelProvider: channel.channelProvider || '',
      ...(channel.channelProvider === 'notifier-webhook' ? { fixedRecipient: true } : {}),
    })))
    .filter(method => Boolean(
      method.id
      && method.providerId
      && isSupportedSceneNotifyChannel(method.channelProvider),
    ))
}
