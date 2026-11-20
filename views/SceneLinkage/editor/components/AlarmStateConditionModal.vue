<template>
  <a-modal
    :open="open"
    :width="980"
    :footer="null"
    :mask-closable="false"
    wrap-class-name="scene-alarm-condition-modal"
    @cancel="$emit('cancel')"
  >
    <template #title>{{ title }}</template>
    <div class="alarm-condition-modal">
      <aside class="alarm-condition-modal__rules">
        <div class="alarm-condition-modal__rules-title">
          <strong>{{ listTitle }}</strong>
          <span>{{ $t('IotSceneLinkage.alarmCondition.ruleCount', { count: filteredRules.length }) }}</span>
        </div>
        <a-input v-model:value="keyword" allow-clear :placeholder="searchPlaceholder">
          <template #prefix><AIcon type="SearchOutlined" /></template>
        </a-input>
        <a-alert v-if="selectedTaskIssue" type="warning" show-icon :message="$t(`IotSceneLinkage.alarmCondition.selectedTask.${selectedTaskIssue}`)" />
        <a-spin :spinning="loading">
          <div class="alarm-condition-modal__rule-list">
            <button
              v-for="rule in filteredRules"
              :key="rule.id"
              :disabled="rule.unavailable"
              :class="['alarm-condition-modal__rule', { 'alarm-condition-modal__rule--selected': rule.id === selectedRuleId }]"
              @click="selectRule(rule)"
            >
              <span class="alarm-condition-modal__rule-head"><span class="alarm-condition-modal__rule-name">{{ rule.name }}</span><a-tag v-if="rule.level" :color="alarmLevelColor(rule.level)">{{ alarmLevelText(rule.level) }}</a-tag></span>
              <span v-for="line in rule.lines" :key="line" class="alarm-condition-modal__rule-line">{{ line }}</span>
            </button>
            <a-result v-if="!loading && loadError" status="error" :title="$t('IotSceneLinkage.alarmCondition.loadFailed')">
              <template #extra><a-button type="link" @click="resetAndLoad">{{ $t('IotSceneLinkage.action.retry') }}</a-button></template>
            </a-result>
            <a-empty v-else-if="!loading && !filteredRules.length" :description="$t('IotSceneLinkage.alarmCondition.empty')" />
            <a-button v-if="sourceKind === 'visual-ai' && hasMoreVisualTasks" type="link" :loading="loadingMoreVisualTasks" @click="loadMoreVisualAlarmRules">{{ $t('IotSceneLinkage.action.loadMore') }}</a-button>
          </div>
        </a-spin>
      </aside>

      <section class="alarm-condition-modal__detail">
        <template v-if="selectedRule">
          <header class="alarm-condition-modal__detail-header">
            <span class="alarm-condition-modal__detail-icon"><AIcon :type="sourceKind === 'visual-ai' ? 'EyeOutlined' : 'AlertOutlined'" /></span>
            <div><strong>{{ selectedRule.name }}</strong><small>{{ sourceLabel }}</small></div>
            <a-tag v-if="selectedRule.level" :color="alarmLevelColor(selectedRule.level)">{{ alarmLevelText(selectedRule.level) }}</a-tag>
            <a-tooltip :title="$t('IotSceneLinkage.alarmCondition.detailHelp')"><AIcon type="QuestionCircleOutlined" /></a-tooltip>
          </header>

          <dl class="alarm-condition-modal__detail-list">
            <template v-for="item in selectedRule.details" :key="item.label">
              <dt>{{ item.label }}</dt><dd>{{ item.value }}</dd>
            </template>
          </dl>

          <section v-if="states.length" class="alarm-condition-modal__state">
            <strong>{{ stateTitle }}</strong>
            <div class="alarm-condition-modal__state-options">
              <button
                v-for="state in states"
                :key="state.value"
                :class="['alarm-condition-modal__state-option', { 'alarm-condition-modal__state-option--selected': isStateSelected(state.value) }]"
                @click="changeState(state.value)"
              >
                <AIcon :type="state.icon" /><b>{{ state.label }}</b><a-tooltip :title="state.description"><AIcon type="QuestionCircleOutlined" /></a-tooltip>
              </button>
            </div>

      </section>
        </template>
        <a-empty v-else :description="$t('IotSceneLinkage.alarmCondition.selectRule')" />
        <SceneConfigPreview class="alarm-condition-modal__preview"><SceneSummaryParts v-if="mode === 'trigger'" :parts="triggerPreview" /><SceneSummaryParts v-else :parts="conditionPreview" /></SceneConfigPreview>
      </section>


    </div>
    <footer class="alarm-condition-modal__footer">
      <a-button @click="$emit('cancel')">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
      <a-button type="primary" :disabled="!selectedRule || selectedRule.unavailable" @click="save">{{ $t('IotSceneLinkage.action.confirm') }}</a-button>
    </footer>
  </a-modal>
</template>

<script setup lang="ts">
import { type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import SceneConfigPreview from './SceneConfigPreview.vue'
import SceneSummaryParts from './SceneSummaryParts.vue'
import type { SceneAlarmTriggerConfig } from '../../utils'
import type { AlarmSourceKind } from '../alarm/alarmConditionResourceService'
import { useAlarmConditionModel } from '../alarm/useAlarmConditionModel'

const props = defineProps({
  open: Boolean,
  sourceKind: { type: String as PropType<AlarmSourceKind>, required: true },
  mode: { type: String as PropType<'trigger' | 'condition' | 'query'>, default: 'condition' },
  modelValue: { type: Object as PropType<SceneAlarmTriggerConfig>, required: true },
})
const emit = defineEmits<{
  (event: 'update:modelValue', value: SceneAlarmTriggerConfig): void
  (event: 'cancel'): void
  (event: 'save'): void
}>()
const { t } = useI18n()
const { loading, loadError, keyword, hasMoreVisualTasks, loadingMoreVisualTasks, selectedTaskIssue,
  title, listTitle, sourceLabel, searchPlaceholder, filteredRules, selectedRuleId, selectedRule,
  states, stateTitle, triggerPreview, conditionPreview, resetAndLoad, selectRule,
  alarmLevelText, alarmLevelColor, loadMoreVisualAlarmRules, isStateSelected, changeState, getValue,
} = useAlarmConditionModel(() => ({ open: props.open, sourceKind: props.sourceKind, mode: props.mode, modelValue: props.modelValue }), t)

function save() {
  const value = getValue()
  if (!value) return
  emit('update:modelValue', value)
  emit('save')
}
</script>

<style scoped>
.alarm-condition-modal { display: grid; grid-template-columns: 390px minmax(0, 1fr); min-height: 440px; border: 1px solid #eef0f3; border-radius: 8px; }
.alarm-condition-modal__rules { display: flex; flex-direction: column; min-width: 0; padding: 16px; border-right: 1px solid #eef0f3; }
.alarm-condition-modal__rules > .ant-input-affix-wrapper { width: 280px; max-width: 100%; }
.alarm-condition-modal__rules-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }.alarm-condition-modal__rules-title span { color: var(--ant-color-text-tertiary); font-size: 12px; }
.alarm-condition-modal__rule-list { display: grid; gap: 8px; max-height: 410px; margin-top: 12px; overflow: auto; padding-right: 4px; }
.alarm-condition-modal__rule { display: grid; gap: 5px; padding: 12px; text-align: left; cursor: pointer; background: var(--ant-color-bg-container); border: 1px solid transparent; border-radius: 8px; }.alarm-condition-modal__rule:hover { background: #f7faff; border-color: #b7d2ff; }.alarm-condition-modal__rule--selected { background: #f4f8ff; border-color: var(--ant-color-primary); }
.alarm-condition-modal__rule-head { display: flex; gap: 8px; align-items: center; min-width: 0; }.alarm-condition-modal__rule-name { flex: 1; min-width: 0; overflow: hidden; color: var(--ant-color-text); font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }.alarm-condition-modal__rule-line { color: var(--ant-color-text-secondary); font-size: 12px; line-height: 18px; }
.alarm-condition-modal__detail { display: flex; flex-direction: column; min-width: 0; padding: 16px 20px; }
.alarm-condition-modal__detail-header { display: flex; gap: 12px; align-items: center; }.alarm-condition-modal__detail-header > div { display: grid; flex: 1; gap: 2px; min-width: 0; }.alarm-condition-modal__detail-header small { color: var(--ant-color-text-tertiary); }.alarm-condition-modal__detail-header > .anticon { color: var(--ant-color-text-tertiary); }
.alarm-condition-modal__detail-icon { display: grid; place-items: center; width: 36px; height: 36px; color: var(--ant-color-primary); background: #eef5ff; border-radius: 8px; }
.alarm-condition-modal__detail-list { display: grid; grid-template-columns: 110px minmax(0, 1fr); margin: 16px 0; border: 1px solid #f0f1f3; border-radius: 8px; overflow: hidden; }.alarm-condition-modal__detail-list dt, .alarm-condition-modal__detail-list dd { min-height: 39px; margin: 0; padding: 10px 14px; border-bottom: 1px solid #f0f1f3; }.alarm-condition-modal__detail-list dt:nth-last-of-type(1), .alarm-condition-modal__detail-list dd:last-child { border-bottom: 0; }.alarm-condition-modal__detail-list dt { color: var(--ant-color-text-tertiary); background: #fafbfc; }.alarm-condition-modal__detail-list dd { overflow: hidden; color: var(--ant-color-text); font-weight: 500; text-align: left; overflow-wrap: anywhere; }
.alarm-condition-modal__state { display: grid; gap: 12px; }.alarm-condition-modal__state-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.alarm-condition-modal__state-option { display: flex; gap: 8px; align-items: center; min-height: 56px; padding: 0 14px; color: var(--ant-color-text-secondary); cursor: pointer; background: var(--ant-color-bg-container); border: 1px solid #d9e2ef; border-radius: 8px; }.alarm-condition-modal__state-option b { color: inherit; }.alarm-condition-modal__state-option > :last-child { margin-left: auto; color: var(--ant-color-text-tertiary); }.alarm-condition-modal__state-option--selected { color: var(--ant-color-primary); background: #edf5ff; border-color: var(--ant-color-primary); }
.alarm-condition-modal__preview { width: 100%; margin: 16px 0 0; }
.alarm-condition-modal__footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
@media (max-width: 760px) { .alarm-condition-modal { grid-template-columns: 1fr; }.alarm-condition-modal__rules { border-right: 0; border-bottom: 1px solid #eef0f3; }.alarm-condition-modal__rule-list { max-height: 220px; } }
</style>
