<template>
  <div class="device-state-trigger">
    <div class="device-state-trigger__row">
      <span class="device-state-trigger__label">{{ state === 'any' ? $t('IotSceneLinkage.stateCondition.anyPhrasePrefix') : $t('IotSceneLinkage.stateCondition.phrasePrefix') }}</span>
      <a-select class="device-state-trigger__select" :value="state" :options="stateOptions" @update:value="updateState" />
      <span class="device-state-trigger__label">{{ $t('IotSceneLinkage.stateTriggerMode.phraseSeparator') }}</span>
      <a-select class="device-state-trigger__mode" :value="mode" :disabled="state === 'any'" :options="modeOptions" @update:value="updateMode" />
      <template v-if="mode === 'sustained'">
        <a-input-number :value="sustainedTime" :min="1" :precision="0" @update:value="emit('update:sustainedTime', $event || 1)" />
        <span class="device-state-trigger__unit">{{ $t('IotSceneLinkage.stateTriggerMode.sustainedSuffix') }}</span>
      </template>
      <a-button v-if="removable" class="device-state-trigger__remove" type="text" danger @click="emit('remove')"><AIcon type="DeleteOutlined" /></a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

type DeviceState = 'online' | 'offline' | 'any'
type TriggerMode = 'immediate' | 'sustained'

const props = defineProps<{
  state: DeviceState
  mode: TriggerMode
  sustainedTime: number
  removable: boolean
}>()

const emit = defineEmits<{
  'update:state': [value: DeviceState]
  'update:mode': [value: TriggerMode]
  'update:sustainedTime': [value: number]
  remove: []
}>()

const { t } = useI18n()
const stateOptions = computed(() => ['offline', 'online', 'any'].map(value => ({
  value,
  label: t(`IotSceneLinkage.stateCondition.${value}`),
})))
const modeOptions = computed(() => (props.state === 'any' ? ['immediate'] : ['immediate', 'sustained']).map(value => ({
  value,
  label: t(`IotSceneLinkage.stateTriggerMode.${value}`),
})))

const updateState = (value: unknown) => {
  if (value !== 'online' && value !== 'offline' && value !== 'any') return
  emit('update:state', value)
  if (value === 'any') emit('update:mode', 'immediate')
}

const updateMode = (value: unknown) => {
  if (value === 'immediate' || value === 'sustained') emit('update:mode', value)
}

watch(() => props.state, value => {
  if (value === 'any' && props.mode !== 'immediate') emit('update:mode', 'immediate')
})
</script>

<style scoped>
.device-state-trigger { flex: 0 0 100%; width: 100%; min-width: 0; }
.device-state-trigger__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2, 8px); }
.device-state-trigger__label { color: var(--ant-color-text-secondary); }
.device-state-trigger__select { width: 10rem; }
.device-state-trigger__mode { width: 8rem; }
.device-state-trigger__unit { color: var(--ant-color-text-secondary); }
.device-state-trigger__remove { flex: none; margin-left: auto; }
</style>
