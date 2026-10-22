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
    || Boolean(channelProvider?.startsWith('notifier-'))
}

export function requiresSceneNotifyTemplate(channelProvider?: string): boolean {
  return Boolean(channelProvider?.startsWith('notifier-'))
}

export function toSceneNotifyMethods(providers: SceneNotifyProvider[]): SceneNotifyMethod[] {
  return providers
    .filter(provider => provider.provider === 'scene')
    .flatMap(provider => (provider.channels || []).map(channel => ({
      id: channel.id || '',
      providerId: provider.id || provider.provider || '',
      name: channel.name || channel.channelProvider || '',
      channelProvider: channel.channelProvider || '',
    })))
    .filter(method => Boolean(
      method.id
      && method.providerId
      && isSupportedSceneNotifyChannel(method.channelProvider),
    ))
}
