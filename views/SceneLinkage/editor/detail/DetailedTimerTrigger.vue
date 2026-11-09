<template>
  <a-form-item :name="['trigger', 'timer']" :rules="rules" class="detailed-timer-trigger">
    <DetailedTriggerNode :rule="data" @edit="openModal" @remove="emit('remove')" />
  </a-form-item>

  <a-modal
    :open="visible"
    :title="$t('IotSceneLinkage.detail.timerTrigger')"
    :width="820"
    :mask-closable="false"
    :keyboard="false"
    :footer="null"
    @cancel="visible = false"
  >
    <header class="detailed-timer-trigger__modal-header">
      <strong>{{ $t('IotSceneLinkage.detail.timerTrigger') }}</strong>
      <span>{{ $t('IotSceneLinkage.detail.timerTriggerHint') }}</span>
    </header>
    <TimerEditor ref="timerRef" v-model:value="draftTimer" type="timer" />
    <section class="detailed-timer-trigger__preview">
      <span>{{ $t('IotSceneLinkage.detail.currentTimerRule') }}</span>
      <b>{{ draftSummary }}</b>
    </section>
    <footer class="detailed-timer-trigger__footer">
      <a-button @click="visible = false">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
      <a-button type="primary" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button>
    </footer>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, type Ref } from 'vue'
import { cloneDeep } from 'lodash-es'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useSceneStore } from '@rule-engine-manager-ui/store/scene'
import TimerEditor from '../../../Scene/Save/components/Timer/index.vue'
import DetailedTriggerNode from './DetailedTriggerNode.vue'
import { handleTimerOptions } from '../../../Scene/Save/components/Timer/util'
import type { OperationTimer } from '../../../Scene/typings'

const { data: storeData } = storeToRefs(useSceneStore())
const data = storeData as unknown as Ref<Record<string, any>>
const { t } = useI18n()
const emit = defineEmits<{ remove: [] }>()
const visible = ref(false)
const timerRef = ref<{ validateFields: () => Promise<unknown> }>()
const draftTimer = reactive<OperationTimer>({} as OperationTimer)
const rules = computed(() => [{ required: true, message: t('IotSceneLinkage.detail.timerRequired') }])

function getTimerSummary(timer?: OperationTimer) {
  if (!timer) return ''
  const { when, time, extraTime } = handleTimerOptions(timer)
  return [when, time, extraTime].filter(Boolean).join('，')
}

const draftSummary = computed(() => getTimerSummary(draftTimer)
  || t('IotSceneLinkage.detail.noTimerRule'))

function openModal() {
  Object.assign(draftTimer, cloneDeep(data.value.trigger?.timer || {}))
  visible.value = true
}

defineExpose({ openConfig: openModal })

/** 定时规则仍写入原生 timer 字段，弹窗只统一承载标题、说明和规则概览。 */
async function save() {
  const valid = await timerRef.value?.validateFields().catch(() => undefined)
  if (!valid) return
  const timer = cloneDeep(draftTimer)
  data.value.trigger = { ...(data.value.trigger || {}), type: 'timer', timer }
  data.value.options = {
    ...(data.value.options || {}),
    trigger: handleTimerOptions(timer),
  }
  visible.value = false
}
</script>

<style scoped>
.detailed-timer-trigger { margin-bottom: var(--space-4, 16px); }
.detailed-timer-trigger__card { display: flex; align-items: center; min-height: 4.125rem; padding: var(--space-3, 12px) var(--space-4, 16px); text-align: left; background: var(--ant-color-bg-container); border-color: var(--ant-color-border-secondary); }
.detailed-timer-trigger__card:hover { border-color: var(--ant-color-primary); }
.detailed-timer-trigger__icon { display: grid; flex: none; place-items: center; width: 2.5rem; height: 2.5rem; margin-right: var(--space-3, 12px); color: var(--ant-color-primary); background: var(--ant-color-primary-bg); border-radius: 50%; }
.detailed-timer-trigger__content { display: grid; flex: 1; gap: 4px; min-width: 0; }.detailed-timer-trigger__content b, .detailed-timer-trigger__content small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.detailed-timer-trigger__content b { color: var(--ant-color-text); }.detailed-timer-trigger__content small { color: var(--ant-color-text-tertiary); font-size: 12px; }
.detailed-timer-trigger__modal-header { display: grid; gap: 4px; margin-bottom: var(--space-4, 16px); }.detailed-timer-trigger__modal-header span { color: var(--ant-color-text-tertiary); font-size: 12px; }
.detailed-timer-trigger__preview { display: grid; gap: 4px; margin-top: var(--space-4, 16px); padding: var(--space-3, 12px); background: var(--ant-color-fill-quaternary); border-radius: var(--radius-jet-sm, 8px); }.detailed-timer-trigger__preview span { color: var(--ant-color-text-secondary); font-size: 12px; }.detailed-timer-trigger__preview b { color: var(--ant-color-text); font-weight: 500; }
.detailed-timer-trigger__footer { display: flex; justify-content: flex-end; gap: var(--space-2, 8px); padding-top: var(--space-4, 16px); margin-top: var(--space-4, 16px); border-top: 1px solid var(--ant-color-border-secondary); }
</style>
