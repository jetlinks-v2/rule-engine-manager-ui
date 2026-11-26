<template>
  <section class="detailed-scene-execution">
    <section v-if="usesDirectAction" class="detailed-scene-execution__direct-card">
      <header class="detailed-scene-execution__card-header">
        <span class="detailed-scene-execution__card-icon"><AIcon type="PlayCircleOutlined" /></span>
        <div>
          <strong>{{ $t('IotSceneLinkage.detail.executeActionTitle') }}</strong>
          <small>{{ $t('IotSceneLinkage.detail.executeActionDescription') }}</small>
        </div>
      </header>
      <a-form-item
        class="detailed-scene-execution__direct-action"
        :name="['branches', 0, 'then']"
        :rules="directActionRules"
      >
        <Action :then-options="firstBranch?.then || []" :name="0" show-action-controls />
      </a-form-item>
    </section>
    <Terms v-else show-action-controls :show-filter-toggle="false" :show-title="false" detail-card-layout />
  </section>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import Action from '../../../Scene/Save/action/index.vue'
import Terms from '../../../Scene/Save/components/Terms/Terms.vue'
import type { SceneRuleRecord } from '../editorMode'

const props = defineProps({
  rule: {
    type: Object as PropType<SceneRuleRecord>,
    required: true,
  },
  triggerType: {
    type: String,
    default: '',
  },
})

const { t } = useI18n()
const firstBranch = computed(() => props.rule.branches?.find((branch: SceneRuleRecord) => Boolean(branch)))
const hasConfiguredConditions = computed(() => (props.rule.branches || [])
  .some((branch: SceneRuleRecord) => Array.isArray(branch?.when) && branch.when.length > 0))
const timerOnlyMultiTrigger = computed(() => {
  if (props.triggerType !== 'multi' || hasConfiguredConditions.value) return false
  const triggers = props.rule.trigger?.multi?.triggers
  return Array.isArray(triggers)
    && triggers.length > 0
    && triggers.every((item: SceneRuleRecord) => item?.trigger?.type === 'timer')
})
// 定时、手动和仅含定时叶子的 multi 原本都只使用首个动作组。
// 空条件树没有可配置参数；保留已有 when 时仍使用完整 Terms，避免改写历史分支语义。
const isTimerAction = computed(() => props.triggerType === 'timer' || timerOnlyMultiTrigger.value)
const usesDirectAction = computed(() => props.triggerType === 'manual' || isTimerAction.value)
const directActionRules = computed(() => [{
  validator(_: unknown, value?: Array<{ actions?: unknown[] }>) {
    const hasAction = value?.some(item => Boolean(item.actions?.length))
    return hasAction
      ? Promise.resolve()
      : Promise.reject(t(isTimerAction.value
        ? 'Timer.index.663670-4'
        : 'Manual.index.515142-3'))
  },
}])
</script>

<style scoped>
.detailed-scene-execution { display: grid; min-width: 0; gap: var(--space-2, 8px); }
.detailed-scene-execution__direct-action { margin: 0; padding: 0; }
.detailed-scene-execution__direct-card { overflow: hidden; background: var(--ant-color-bg-container); border: 1px solid var(--detailed-scene-border, #e5e6eb); border-radius: var(--radius-jet-sm, 8px); }
.detailed-scene-execution__card-header { display: flex; gap: var(--space-3, 12px); align-items: flex-start; padding: var(--space-3, 12px) var(--space-4, 16px); background: #fafbfc; border-bottom: 1px solid var(--detailed-scene-subtle-border, #f0f0f0); }
.detailed-scene-execution__card-icon { display: grid; flex: none; width: 1.75rem; height: 1.75rem; place-items: center; color: var(--ant-color-primary); background: var(--ant-color-primary-bg); border-radius: var(--radius-jet-sm, 6px); }
.detailed-scene-execution__card-header > div { display: grid; gap: 2px; min-width: 0; }
.detailed-scene-execution__card-header strong { color: var(--ant-color-text); font-size: .875rem; font-weight: 600; line-height: 1.25rem; }
.detailed-scene-execution__card-header small { color: var(--ant-color-text-tertiary); font-size: .75rem; line-height: 1.125rem; }
.detailed-scene-execution__direct-card :deep(.actions) { padding: var(--space-3, 12px); }
.detailed-scene-execution :deep(.actions), .detailed-scene-execution :deep(.actions-terms) { display: grid; gap: var(--space-2, 8px); }
.detailed-scene-execution :deep(.actions > .actions-title), .detailed-scene-execution :deep(.actions-terms > .title-component) { margin: 0; padding: var(--space-2, 8px) var(--space-3, 12px); color: var(--ant-color-text); background: var(--ant-color-bg-container); border: 1px solid var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 8px); }
.detailed-scene-execution :deep(.actions > .actions-title) { line-height: 1.5rem; }
.detailed-scene-execution :deep(.ant-tabs-nav) { margin-bottom: var(--space-3, 12px); }
.detailed-scene-execution :deep(.ant-tabs-card > .ant-tabs-nav .ant-tabs-tab) { margin-right: 4px; background: var(--ant-color-bg-container); border-color: var(--ant-color-border-secondary); border-radius: 6px 6px 0 0; }
.detailed-scene-execution :deep(.ant-tabs-card > .ant-tabs-nav .ant-tabs-tab-active) { color: var(--ant-color-primary); background: var(--ant-color-primary-bg); border-color: var(--ant-color-primary); border-bottom-color: var(--ant-color-primary-bg); }
.detailed-scene-execution :deep(.actions-terms-warp) { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-3, 12px); align-items: start; width: 100% !important; padding: var(--space-3, 12px); margin: 0 0 var(--space-3, 12px) !important; background: var(--ant-color-bg-container); border: 1px solid var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 8px); }
.detailed-scene-execution :deep(.actions-terms-warp .actions-terms-title) { display: inline-flex; gap: var(--space-2, 8px); align-items: center; align-self: start; min-width: 0; min-height: 3.25rem; padding: 0 !important; margin: 0 !important; color: var(--ant-color-text); font-size: .875rem; font-weight: 600; white-space: nowrap; }
.detailed-scene-execution :deep(.actions-terms-options) { width: 100%; border-color: var(--ant-color-border-secondary); }
.detailed-scene-execution :deep(.actions-terms-warp--otherwise) { grid-template-columns: max-content max-content; align-items: center; }
.detailed-scene-execution :deep(.actions-terms-warp--otherwise .actions-terms-options.no-when) { display: flex; flex: none; flex-grow: 0; width: auto; min-height: 0; align-items: center; }
.detailed-scene-execution :deep(.actions-terms-warp--otherwise .actions-terms-title) { min-height: 0; align-self: center; }
.detailed-scene-execution :deep(.actions-terms-list) { display: flex; align-items: center; min-height: 3.25rem; padding: 0; background: transparent; border: 0; }
.detailed-scene-execution :deep(.actions-terms-list-content__items) { display: flex; align-items: center; padding-top: 0; overflow: auto; }
.detailed-scene-execution :deep(.actions-terms-options.border) { padding: var(--space-3, 12px); background: var(--ant-color-fill-quaternary); border: 1px dashed var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 6px); }
.detailed-scene-execution :deep(.actions-branches) { width: 100% !important; padding-top: 0; margin-top: 0; }
.detailed-scene-execution :deep(.actions-branches > .ant-form-item) { margin-bottom: 0; }
.detailed-scene-execution :deep(.actions-warp) { width: 100%; background: transparent; }
.detailed-scene-execution :deep(.actions-warp .ant-collapse) { display: grid; gap: var(--space-2, 8px); background: transparent; border: 0; }
/* 串行、并行面板本身是唯一的动作组卡片边界，框住标题及其完整动作列表。 */
.detailed-scene-execution :deep(.actions-warp .ant-collapse-item) { overflow: hidden; background: var(--ant-color-bg-container); border: 1px solid var(--detailed-scene-border, #e5e6eb) !important; border-radius: var(--radius-jet-sm, 8px); }
.detailed-scene-execution :deep(.actions-warp .ant-collapse-header) { padding-inline: var(--space-4, 16px); background: #f7f8fa; }
.detailed-scene-execution :deep(.actions-warp .ant-collapse-content) { border-top: 1px solid var(--detailed-scene-subtle-border, #f0f0f0) !important; }
.detailed-scene-execution :deep(.actions-warp .ant-collapse-content-box) { padding: 0 !important; }
.detailed-scene-execution :deep(.actions-warp .actions-list) { padding: var(--space-3, 12px); margin: 0; background: transparent; border: 0; }
.detailed-scene-execution :deep(.actions-warp .action-list-content) { gap: var(--space-3, 12px); }
.detailed-scene-execution :deep(.actions-warp .actions-item-warp > .ant-form-item) { margin: 0; padding: 0; background: transparent; border: 0; }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp:not(.filter-border)) { margin-bottom: 0; padding: 0; border: 0; }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp:not(.filter-border) .filter-add-button) { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 2rem; color: var(--ant-color-text-tertiary); border: 1px dashed var(--ant-color-border-secondary); border-radius: var(--radius-jet-sm, 6px); }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp:not(.filter-border) .filter-add-button:hover) { color: var(--ant-color-primary); border-color: var(--ant-color-primary); background: var(--ant-color-primary-bg); }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp.filter-border) { margin: 0; padding: var(--space-3, 12px) var(--space-4, 16px); background: #f7f8fa; border: 1px solid var(--detailed-scene-border, #e5e6eb); border-radius: var(--radius-jet-sm, 6px); }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp.filter-border .actions-item-filter-warp-tip) { left: var(--space-4, 16px); font-weight: 400; background: #f7f8fa; }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp.filter-border .actions-item-filter-overflow) { padding-top: 0; }
.detailed-scene-execution :deep(.actions-warp .actions-add-list) { width: 100%; }
.detailed-scene-execution :deep(.actions-warp .actions-add-list.border) { padding-top: 0; background: transparent; border: 0 !important; box-shadow: none; }
.detailed-scene-execution :deep(.actions-warp .actions-add-list__button) { width: 100% !important; height: 2.5rem; border-style: dashed !important; }
/* 详细模式的分支仍复用原版树，仅把条件与动作分段为可读的嵌套卡片。 */
.detailed-scene-execution :deep(.actions-terms-warp--detail) { display: block; width: 100% !important; padding: 0; margin: 0 0 var(--space-3, 12px) !important; overflow: hidden; background: var(--ant-color-bg-container); border: 1px solid var(--detailed-scene-border, #e5e6eb); border-radius: var(--radius-jet-sm, 8px); }
.detailed-scene-execution :deep(.actions-terms-warp--detail > .actions-terms-options) { position: static; display: block; width: auto; padding: 0; margin: 0; background: transparent; border: 0; }
.detailed-scene-execution :deep(.actions-terms-warp--detail:not(.first-children) > .actions-terms-options) { padding-top: var(--space-3, 12px); }
.detailed-scene-execution :deep(.actions-terms-warp--detail .actions-terms-list) { display: block; min-height: 0; margin: 0; padding: var(--space-3, 12px) var(--space-4, 16px); background: transparent; border: 0; }
/* 分组沿横向排列，由原有滚动容器承接溢出；边缘留白容纳条件项的悬浮操作。 */
.detailed-scene-execution :deep(.actions-terms-warp--detail .actions-terms-list-content__items) { display: flex; flex-wrap: nowrap; align-items: center; padding: var(--space-3, 12px); overflow: visible; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .terms-params-content) { padding-right: 2rem; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .terms-params-content > .terms-params-delete) { top: 4px; right: 4px; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .actions-branches) { padding: 0; margin: 0; border: 0; }
/* 条件与动作标题共用分支外框的左右边界，串行/并行在各自内容区内表达层级。 */
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card) { margin: 0; border: 0; border-radius: 0; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card > .detailed-scene-section-header) { border-top: 1px solid var(--detailed-scene-subtle-border, #f0f0f0); }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card > .ant-form-item) { margin: 0; padding: var(--space-3, 12px) var(--space-4, 16px) var(--space-4, 16px); }
.detailed-scene-execution :deep(.actions-terms-warp--detail .actions-branches .actions-title) { display: none; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .actions-branches .actions-title > span:first-child), .detailed-scene-execution__direct-card :deep(.actions-title) { display: none; }
.detailed-scene-execution :deep(.actions-terms-warp--detail.actions-terms-warp--otherwise) { display: block; }
.detailed-scene-execution :deep(.actions-terms-warp--detail.actions-terms-warp--otherwise .actions-terms-options.no-when) { display: block; width: auto; padding: var(--space-3, 12px) var(--space-4, 16px); }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-filter-delete) { display: none !important; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-branch-card__header:not(.detailed-scene-section-header)), .detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card__header:not(.detailed-scene-section-header)) { display: flex; gap: var(--space-3, 12px); align-items: flex-start; padding: var(--space-3, 12px) var(--space-4, 16px); background: #fafbfc; border-bottom: 1px solid var(--detailed-scene-subtle-border, #f0f0f0); }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-branch-card__icon), .detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card__icon) { display: grid; flex: none; width: 1.75rem; height: 1.75rem; place-items: center; color: var(--ant-color-primary); background: var(--ant-color-primary-bg); border-radius: var(--radius-jet-sm, 6px); }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-branch-card__icon--otherwise) { color: var(--ant-color-primary); background: var(--ant-color-primary-bg); }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-branch-card__header > div), .detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card__header > div) { display: grid; gap: 2px; min-width: 0; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-branch-card__header strong), .detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card__header strong) { color: var(--ant-color-text); font-size: .875rem; font-weight: 600; line-height: 1.25rem; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-branch-card__header small), .detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card__header small) { color: var(--ant-color-text-tertiary); font-size: .75rem; line-height: 1.125rem; }
.detailed-scene-execution :deep(.detailed-scene-branch-card__add-otherwise) { display: inline-flex; align-items: center; justify-content: center; width: 2rem; min-width: 2rem; height: 2rem; padding: 0; color: var(--ant-color-text-tertiary); background: var(--ant-color-bg-container); border-color: var(--ant-color-border); line-height: 1; }
.detailed-scene-execution :deep(.actions-terms-warp--detail.actions-terms-warp--otherwise .actions-terms-options) { text-align: center; }
/* 同一分支只保留一条内容对齐线，串行/并行依靠自身边框表达动作层级，不再继续向右缩进。 */
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card .actions-warp) { margin: 0; padding: 0; background: transparent; border: 0; border-radius: 0; }
.detailed-scene-execution :deep(.detailed-scene-branch-card__add-otherwise:hover) { color: var(--ant-color-primary); border-color: var(--ant-color-primary); }
</style>
