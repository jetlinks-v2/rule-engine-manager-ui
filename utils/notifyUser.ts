type NotifyUser = {
  id: string
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
