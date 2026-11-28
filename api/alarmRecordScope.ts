/** A deep link pins an explicit target/state; the original alarm service still authorizes every query. */
export function alarmRecordScope(query: Record<string, unknown>) {
  const targetId = typeof query.targetId === 'string' ? query.targetId : ''
  const targetType = typeof query.targetType === 'string' ? query.targetType : ''
  if (!targetId || !targetType) return []
  return [
    { column: 'targetId', termType: 'eq', value: targetId },
    { column: 'targetType', termType: 'eq', value: targetType },
    ...(query.state === 'warning' || query.state === 'normal'
      ? [{ column: 'state', termType: 'eq', value: query.state }]
      : [])
  ]
}
