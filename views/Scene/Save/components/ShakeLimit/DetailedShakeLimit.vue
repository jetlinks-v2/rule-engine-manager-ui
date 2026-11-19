<template>
  <section class="detailed-shake-limit" :aria-label="$t('ShakeLimit.title')">
    <header class="detailed-shake-limit__header">
      <strong>{{ $t('ShakeLimit.title') }}</strong>
      <a-tooltip :title="$t('ShakeLimit.help')">
        <a-button type="text" class="detailed-shake-limit__help" :aria-label="$t('ShakeLimit.help')"><AIcon type="QuestionCircleOutlined" /></a-button>
      </a-tooltip>
      <a-switch v-model:checked="shakeLimit.enabled" :aria-label="$t('ShakeLimit.title')" />
    </header>
    <a-form-item v-if="shakeLimit.enabled" name="shakeLimit" :rules="{ validator }" class="detailed-shake-limit__configuration">
      <div class="detailed-shake-limit__row">
        <span class="detailed-shake-limit__label">{{ $t('ShakeLimit.statistics') }}</span>
        <div class="detailed-shake-limit__fields">
          <span>{{ $t('ShakeLimit.within') }}</span>
          <a-input-number v-model:value="shakeLimit.time" :min="1" :precision="0" :controls="false" :aria-label="$t('ShakeLimit.timeWindow')" />
          <span>{{ $t('ShakeLimit.index.9093426-7') }}</span>
          <a-select :value="String(shakeLimit.continuous)" :options="continuousOptions" :disabled="!shakeLimit.alarmFirst" :aria-label="$t('ShakeLimit.countMode')" @change="shakeLimit.continuous = $event === 'true'" />
          <span>{{ $t('ShakeLimit.index.9093426-8') }}</span>
          <a-input-number v-model:value="shakeLimit.threshold" :min="1" :max="10000" :precision="0" :controls="false" :aria-label="$t('ShakeLimit.threshold')" />
          <span>{{ $t('ShakeLimit.triggerSuffix') }}</span>
        </div>
      </div>
      <div class="detailed-shake-limit__row">
        <span class="detailed-shake-limit__label">{{ $t('ShakeLimit.execution') }}</span>
        <div class="detailed-shake-limit__fields">
          <a-select :value="String(shakeLimit.alarmFirst)" :options="alarmFirstOptions" :disabled="shakeLimit.continuous" :aria-label="$t('ShakeLimit.executionTiming')" @change="setAlarmFirst($event === 'true')" />
          <span>{{ $t('ShakeLimit.index.9093426-10') }}</span>
          <a-select class="detailed-shake-limit__action-select" :value="String(shakeLimit.outputFirst)" :options="outputFirstOptions" :aria-label="$t('ShakeLimit.actionSelection')" @change="shakeLimit.outputFirst = $event === 'true'" />
          <span>{{ $t('ShakeLimit.actionSuffix') }}{{ $t('ShakeLimit.cyclePrefix') }}</span>
          <a-select class="detailed-shake-limit__cycle-select" :value="String(shakeLimit.rolling)" :options="rollingOptions" :disabled="!shakeLimit.alarmFirst" :aria-label="$t('ShakeLimit.cyclePolicy')" @change="shakeLimit.rolling = $event === 'true'" />
          <span>{{ $t('ShakeLimit.index.9093426-12') }}</span>
        </div>
      </div>
    </a-form-item>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useShakeLimit, type ShakeLimitValue } from './useShakeLimit'

const props = defineProps<{ value: ShakeLimitValue }>()
const emit = defineEmits<{ 'update:value': [value: ShakeLimitValue] }>()
const { t: $t } = useI18n()
const { shakeLimit, validator, setAlarmFirst } = useShakeLimit(props.value, value => emit('update:value', value), $t)
const options = (keys: [string, string]) => keys.map((key, index) => ({ label: $t(key), value: String(index === 0) }))
const continuousOptions = computed(() => options(['ShakeLimit.index.9093426-15', 'ShakeLimit.index.9093426-16']))
const alarmFirstOptions = computed(() => options(['ShakeLimit.index.9093426-13', 'ShakeLimit.index.9093426-14']))
const outputFirstOptions = computed(() => options(['ShakeLimit.index.9093426-17', 'ShakeLimit.index.9093426-18']))
const rollingOptions = computed(() => options(['ShakeLimit.index.9093426-19', 'ShakeLimit.index.9093426-20']))
</script>

<style scoped>
.detailed-shake-limit { min-width: 0; margin: 0 0 12px 16px; padding: 12px 0; border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.detailed-shake-limit__header { display: flex; align-items: center; gap: 8px; min-height: 32px; }
.detailed-shake-limit__header strong { font-size: 14px; font-weight: 600; }
.detailed-shake-limit__header .detailed-shake-limit__help { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; color: var(--jet-theme-text-secondary, #595959); }
.detailed-shake-limit__configuration { margin-top: 8px; margin-bottom: 0; }
.detailed-shake-limit__row { display: grid; grid-template-columns: 4em minmax(0, 1fr); align-items: start; gap: 12px; }
.detailed-shake-limit__row + .detailed-shake-limit__row { margin-top: 12px; }
.detailed-shake-limit__label { line-height: 32px; color: var(--jet-theme-text-secondary, #595959); }
.detailed-shake-limit__fields { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; line-height: 32px; }
.detailed-shake-limit__fields > span { white-space: nowrap; }
.detailed-shake-limit__fields :deep(.ant-input-number) { width: 72px; }
.detailed-shake-limit__fields :deep(.ant-select) { width: 88px; }
.detailed-shake-limit__fields :deep(.detailed-shake-limit__action-select) { width: 112px; }
.detailed-shake-limit__fields :deep(.detailed-shake-limit__cycle-select) { width: 192px; }
@media (max-width: 640px) { .detailed-shake-limit__row { grid-template-columns: 1fr; gap: 4px; } }
</style>
