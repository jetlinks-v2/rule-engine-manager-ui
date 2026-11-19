import { reactive, watch } from 'vue'

export type ShakeLimitValue = {
  enabled?: boolean
  time?: number | null
  threshold?: number | null
  alarmFirst?: boolean
  outputFirst?: boolean
  continuous?: boolean
  rolling?: boolean
}

/** 两种展示共用原有防抖草稿、校验及执行策略联动，保留提交字段和默认值。 */
export function useShakeLimit(initial: ShakeLimitValue, onChange: (value: ShakeLimitValue) => void, t: (key: string) => string) {
  const shakeLimit = reactive<ShakeLimitValue>({
    enabled: false, time: 1, threshold: 1, alarmFirst: true,
    outputFirst: false, continuous: true, rolling: true, ...initial,
  })
  function validator() {
    return shakeLimit.enabled && (!shakeLimit.time || !shakeLimit.threshold)
      ? Promise.reject(t('ShakeLimit.index.9093426-6'))
      : Promise.resolve()
  }
  function setAlarmFirst(value: boolean) {
    shakeLimit.alarmFirst = value
    if (!value) shakeLimit.rolling = false
  }
  watch(shakeLimit, value => onChange({ ...value }), { deep: true })
  return { shakeLimit, validator, setAlarmFirst }
}
