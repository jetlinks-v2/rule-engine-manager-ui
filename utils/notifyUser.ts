type NotifyUser = {
  id: string
  email?: string
  telephone?: string
}

/** 沿用视觉告警的组织展示口径，仅读取用户详情，不改变通知目标。 */
export function getNotifyUserOrganization(user: {
  orgName?: string; departmentName?: string
  orgList?: Array<{ name?: string }>; parentOrgList?: Array<{ name?: string }>; childrenOrgList?: Array<{ name?: string }>
}): string {
  return user.orgName?.trim() || user.departmentName?.trim()
    || [user.orgList, user.parentOrgList, user.childrenOrgList]
      .flatMap(items => Array.isArray(items) ? items.map(item => item?.name?.trim()).filter(Boolean) : [])
      .join(' / ')
}

/**
 * Keep existing option positions while refreshing user details so selected tags do not jump.
 */
export function mergeNotifyUsersById<T extends NotifyUser>(previous: T[], incoming: T[]): T[] {
  const users = new Map(previous.map((user) => [user.id, user]))
  incoming.forEach((user) => {
    const existing = users.get(user.id)
    users.set(user.id, existing ? { ...existing, ...user } : user)
  })
  return [...users.values()]
}

/**
 * Whether the current user's profile contains a destination supported by a notification channel.
 *
 * Third-party channels need their own binding state and cannot be inferred from the user profile.
 */
export function canReceiveProfileBackedNotification(user: NotifyUser, channelProvider: string): boolean {
  if (!user.id) return false
  // 站内信不依赖邮箱或手机号，任一可选平台用户都可以作为收信人。
  if (['inside-mail', 'inbox'].includes(channelProvider)) return true
  if (channelProvider === 'notifier-email') return Boolean(user.email)
  return ['notifier-sms', 'notifier-voice'].includes(channelProvider) && Boolean(user.telephone)
}
