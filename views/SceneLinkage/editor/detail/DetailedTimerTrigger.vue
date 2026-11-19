<template>
  <a-form-item :name="['trigger', 'timer']" :rules="rules" class="detailed-timer-trigger">
    <DetailedTriggerNode :rule="data" @edit="openModal" @remove="emit('remove')" />
  </a-form-item>

  <a-modal
    v-if="visible"
    :open="visible"
    :title="$t('IotSceneLinkage.detail.timerTrigger')"
    :width="820"
    :mask-closable="false"
    :keyboard="false"
    :footer="null"
    wrap-class-name="detailed-timer-trigger-modal"
    @cancel="cancelConfig"
  >
    <div class="detailed-timer-trigger__body">
      <p class="detailed-timer-trigger__hint">{{ $t('IotSceneLinkage.detail.timerTriggerHint') }}</p>
      <TimerEditor ref="timerRef" v-model:value="draftTimer" type="timer" />
      <SceneConfigPreview :hint="!draftSummary.length ? $t('IotSceneLinkage.detail.timerRequired') : undefined"><SceneSummaryParts :parts="draftSummary" /></SceneConfigPreview>
    </div>
    <footer class="detailed-timer-trigger__footer">
      <a-button @click="cancelConfig">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
      <a-button type="primary" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button>
    </footer>
  </a-modal>
</template>

<script setup lang="ts">
import SceneConfigPreview from '../components/SceneConfigPreview.vue'
import { computed, ref, type Ref } from 'vue'
import { cloneDeep } from 'lodash-es'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useSceneStore } from '@rule-engine-manager-ui/store/scene'
import TimerEditor from '../../../Scene/Save/components/Timer/index.vue'
import DetailedTriggerNode from './DetailedTriggerNode.vue'
import { handleTimerOptions } from '../../../Scene/Save/components/Timer/util'
import SceneSummaryParts from '../components/SceneSummaryParts.vue'
import { useTimerCalendarTags } from '../../../Scene/Save/components/Timer/useTimerCalendarTags'
import { timerNodeSummaryParts } from '../timerNodeSummary'
import type { OperationTimer } from '../../../Scene/typings'

const { data: storeData } = storeToRefs(useSceneStore())
const data = storeData as unknown as Ref<Record<string, any>>
const { t } = useI18n()
const emit = defineEmits<{ remove: []; 'cancel-config': []; 'save-config': [] }>()
const visible = ref(false)
const timerRef = ref<{ validateFields: () => Promise<unknown> }>()
const draftTimer = ref<OperationTimer>({} as OperationTimer)
const rules = computed(() => [{ required: true, message: t('IotSceneLinkage.detail.timerRequired') }])

// 弹窗、节点和规则预览使用同一套时间语义及关键词样式。
const { tags: calendarTags } = useTimerCalendarTags(() => visible.value && draftTimer.value.trigger === 'multi')
const draftSummary = computed(() => timerNodeSummaryParts(draftTimer.value, calendarTags.value))

function openModal() {
  draftTimer.value = cloneDeep(data.value.trigger?.timer || {})
  visible.value = true
}

defineExpose({ openConfig: openModal })

/** 定时规则仍写入原生 timer 字段，弹窗只统一承载标题、说明和规则概览。 */
async function save() {
  const valid = await timerRef.value?.validateFields().catch(() => undefined)
  if (!valid) return
  const timer = cloneDeep(draftTimer.value)
  data.value.trigger = { ...(data.value.trigger || {}), type: 'timer', timer }
  data.value.options = {
    ...(data.value.options || {}),
    trigger: handleTimerOptions(timer),
  }
  visible.value = false
  emit('save-config')
}

/** 取消时丢弃本次定时草稿，重新打开会从已确认配置初始化。 */
function cancelConfig() {
  visible.value = false
  emit('cancel-config')
}
</script>

<style scoped>
.detailed-timer-trigger { margin-bottom: var(--space-4, 16px); }
.detailed-timer-trigger__card { display: flex; align-items: center; min-height: 4.125rem; padding: var(--space-3, 12px) var(--space-4, 16px); text-align: left; background: var(--jet-theme-bg-container, #fff); border-color: var(--jet-theme-border-color-1, #eceff3); }
.detailed-timer-trigger__card:hover { border-color: var(--jet-theme-primary, #1677ff); }
.detailed-timer-trigger__icon { display: grid; flex: none; place-items: center; width: 2.5rem; height: 2.5rem; margin-right: var(--space-3, 12px); color: var(--jet-theme-primary, #1677ff); background: var(--jet-theme-primary-soft, #e8f0ff); border-radius: 50%; }
.detailed-timer-trigger__content { display: grid; flex: 1; gap: 4px; min-width: 0; }.detailed-timer-trigger__content b, .detailed-timer-trigger__content small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.detailed-timer-trigger__content b { color: var(--jet-theme-text, #1d2129); }.detailed-timer-trigger__content small { color: var(--jet-theme-text-secondary, #595959); font-size: 12px; }
:global(.detailed-timer-trigger-modal .ant-modal) { top: 24px; padding-bottom: 24px; }
:global(.detailed-timer-trigger-modal .ant-modal-content) { display: flex; flex-direction: column; max-height: calc(100dvh - 48px); }
:global(.detailed-timer-trigger-modal .ant-modal-header) { flex: none; }
:global(.detailed-timer-trigger-modal .ant-modal-body) { display: flex; flex-direction: column; max-height: calc(100dvh - 9rem); min-height: 0; overflow: hidden; }
.detailed-timer-trigger__body { min-height: 0; overflow: auto; }
.detailed-timer-trigger__hint { margin: 0 0 var(--space-4, 16px); color: var(--jet-theme-text-secondary, #595959); font-size: 12px; line-height: 20px; }
.detailed-timer-trigger__footer { display: flex; flex: none; justify-content: flex-end; gap: var(--space-2, 8px); padding-top: var(--space-4, 16px); margin-top: var(--space-4, 16px); border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); }
</style>
