export const rulePermissionKey = 'rule-permission-key'

export const useRulePermissionContext = (key: string) => {
  console.log('key', key)
  provide(rulePermissionKey, key)
}

export const useRulePermission = () => {
  return inject(rulePermissionKey, 'rule-engine/Instance')
}
