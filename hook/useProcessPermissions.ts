import { computed } from 'vue'
import { useAuthStore } from '@jetlinks-web-core/store'
export function useProcessPermissions() {
  const auth = useAuthStore()
  return computed(() => Object.fromEntries(['configure','remove','start','stop','reconcile','resume','resolve'].map(action => [action,auth.hasPermission(`rule-engine/Process:${action}`)])) as {configure:boolean;remove:boolean;start:boolean;stop:boolean;reconcile:boolean;resume:boolean;resolve:boolean})
}
