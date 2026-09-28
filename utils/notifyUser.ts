type NotifyUser = {
  id: string
  email?: string
  telephone?: string
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
  if (channelProvider === 'notifier-email') return Boolean(user.email)
  return ['notifier-sms', 'notifier-voice'].includes(channelProvider) && Boolean(user.telephone)
}
