<template>
  <section class="detailed-scene-execution">
    <section v-if="usesDirectAction" class="detailed-scene-execution__direct-card">
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
import { findSceneCondition } from '../../sceneRule'
import type { SceneRuleRecord } from '../editorMode'

const props = defineProps({
  rule: {
    type: Object as PropType<SceneRuleRecord>,
    required: true,
  },
  triggerReady: { type: Boolean, default: true },
  triggerType: {
    type: String,
    default: '',
  },
})

const { t } = useI18n()
const firstBranch = computed(() => props.rule.branches?.find((branch: SceneRuleRecord) => Boolean(branch)))
const hasConfiguredConditions = computed(() => (props.rule.branches || [])
  .some((branch: SceneRuleRecord) => Boolean(findSceneCondition(branch?.when, term => Boolean(term.column)))))
const timerOnlyMultiTrigger = computed(() => {
  if (props.triggerType !== 'multi' || hasConfiguredConditions.value) return false
  const triggers = props.rule.trigger?.multi?.triggers
  return Array.isArray(triggers)
    && triggers.length > 0
    && triggers.every((item: SceneRuleRecord) => item?.trigger?.type === 'timer')
})
// 未配置触发规则时只展示动作入口；已有条件或多个分支仍保留完整编辑树。
// 切换展示不写回规则数据，避免隐藏布局时丢失历史条件和动作。
const isTimerAction = computed(() => props.triggerType === 'timer' || timerOnlyMultiTrigger.value)
const usesDirectAction = computed(() => (!props.triggerReady || !props.triggerType) && !hasConfiguredConditions.value && (props.rule.branches?.length || 0) <= 1
  || props.triggerType === 'manual' || isTimerAction.value)
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
.detailed-scene-execution { display: grid; min-width: 0; gap: var(--space-3, 12px); }
.detailed-scene-execution__direct-action { margin: 0; padding: 0; }
.detailed-scene-execution__direct-card { min-width: 0; }
.detailed-scene-execution :deep(.actions),
.detailed-scene-execution :deep(.actions-terms) { min-width: 0; }
/* 页面和分支已经提供动作标题；复用原生动作树时不再重复其内部标题。 */
.detailed-scene-execution :deep(.actions > .actions-title) { display: none; }
.detailed-scene-execution :deep(.ant-tabs-nav) { margin-bottom: 0; }
.detailed-scene-execution :deep(:is(.ant-tabs-card, .ant-tabs-editable-card) > .ant-tabs-nav .ant-tabs-tab) { margin-right: 4px; background: var(--jet-theme-bg-container, #fff); border-color: var(--jet-theme-border-color-1, #eceff3); border-radius: 6px 6px 0 0; }
.detailed-scene-execution :deep(:is(.ant-tabs-card, .ant-tabs-editable-card) > .ant-tabs-nav .ant-tabs-tab-active) { color: var(--jet-theme-primary, #1677ff); background: var(--jet-theme-bg-container, #fff); border-color: var(--jet-theme-border, #e5e6eb); border-bottom-color: var(--jet-theme-bg-container, #fff); }
.detailed-scene-execution :deep(.ant-tabs-content-holder) { min-width: 0; border: 0; border-radius: 0; }

/* 分支以页签、留白和分隔线分层；串行/并行仍保留独立的折叠容器边框。 */
.detailed-scene-execution :deep(.actions-terms-warp--detail) { display: block; width: 100%; min-width: 0; margin: 0 !important; padding: 0; background: transparent; border: 0; }
.detailed-scene-execution :deep(.actions-terms-warp--detail:not(.first-children)) { padding-top: var(--space-4, 16px); border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-section-header) { padding: var(--space-3, 12px) 0 var(--space-2, 8px); background: transparent; }
.detailed-scene-execution :deep(.actions-terms-warp--detail > .actions-terms-options) { position: static; display: block; width: 100%; min-width: 0; margin: 0; padding: 0; background: transparent; border: 0; }
.detailed-scene-execution :deep(.actions-terms-warp--detail:not(.first-children) > .actions-terms-options) { padding-top: var(--space-2, 8px); }
.detailed-scene-execution :deep(.actions-terms-warp--detail .actions-terms-list) { display: block; min-height: 0; margin: 0; padding: 0 0 var(--space-4, 16px) var(--space-4, 16px); background: transparent; border: 0; }
/* 原有横向滚动承接条件组溢出，留白容纳条件项的悬浮操作。 */
.detailed-scene-execution :deep(.actions-terms-warp--detail .actions-terms-list-content__items) { display: flex; flex-wrap: nowrap; align-items: center; padding: var(--space-2, 8px); overflow: visible; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .terms-params-warp) { align-items: center; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .terms-params-content) { padding: 8px 2rem 8px 8px; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .terms-params-content .ant-form-item) { margin-bottom: 0; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .terms-params-content > .terms-params-delete) { top: 4px; right: 4px; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-filter-delete) { display: none !important; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .actions-branches) { width: 100%; margin: 0; padding: 0; border: 0; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card) { margin: 0; padding: 0; overflow: visible; border: 0; border-radius: 0; }
.detailed-scene-execution :deep(.actions-terms-warp--detail .detailed-scene-action-card > .ant-form-item) { margin: 0; padding: 0 0 var(--space-4, 16px) var(--space-4, 16px); }
.detailed-scene-execution :deep(.actions-terms-warp--detail.actions-terms-warp--otherwise) { margin-bottom: 0 !important; padding: var(--space-2, 8px) var(--space-4, 16px); border: 0; border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.detailed-scene-execution :deep(.detailed-scene-branch-card__add-otherwise) { display: inline-flex; gap: 4px; align-items: center; height: 2rem; padding-inline: var(--space-2, 8px); color: var(--jet-theme-primary, #1677ff); }

/* 串行与并行属于同一动作组，仅保留一个折叠容器外框及面板分隔线。 */
.detailed-scene-execution :deep(.actions-warp) { width: 100%; margin: 0; padding: 0; background: transparent; border: 0; border-radius: 0; }
.detailed-scene-execution :deep(.actions .actions-warp .ant-collapse) { display: block; overflow: hidden; background: var(--jet-theme-bg-container, #fff); border: 1px solid var(--jet-theme-border-color-1, #eceff3); border-radius: var(--radius-jet-sm, 6px); }
.detailed-scene-execution :deep(.actions .actions-warp .ant-collapse-item) { overflow: visible; background: transparent; border: 0; border-radius: 0; }
.detailed-scene-execution :deep(.actions .actions-warp .ant-collapse-item + .ant-collapse-item) { border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.detailed-scene-execution :deep(.actions .actions-warp .ant-collapse-header) { min-height: 2.5rem; padding: var(--space-2, 8px) var(--space-3, 12px); background: #fafbfc; border-radius: 0; }
.detailed-scene-execution :deep(.actions .actions-warp .ant-collapse-content) { border-top: 1px solid var(--jet-theme-border-color-1, #eceff3); }
.detailed-scene-execution :deep(.actions .actions-warp .ant-collapse-content-box) { padding: 0; }
.detailed-scene-execution :deep(.actions-warp .actions-list) { width: 100%; margin: 0; padding: var(--space-3, 12px); background: transparent; border: 0; }
.detailed-scene-execution :deep(.actions-warp .action-list-content) { gap: var(--space-2, 8px); padding: 0; }
.detailed-scene-execution :deep(.actions-warp .actions-item-warp > .ant-form-item) { margin: 0; padding: 0; background: transparent; border: 0; }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp:not(.filter-border)) { margin-bottom: 0; padding: 0; border: 0; }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp.filter-border) { margin: var(--space-2, 8px) 0 0; padding: var(--space-3, 12px); background: #fafbfc; border: 1px solid var(--jet-theme-border-color-1, #eceff3); border-radius: var(--radius-jet-sm, 6px); }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp.filter-border .actions-item-filter-warp-tip) { left: var(--space-3, 12px); font-weight: 400; background: var(--jet-theme-bg-container, #fff); }
.detailed-scene-execution :deep(.actions-warp .actions-item-filter-warp.filter-border .actions-item-filter-overflow) { padding-top: 0; }
.detailed-scene-execution :deep(.actions-warp .actions-add-list) { width: 100%; }
.detailed-scene-execution :deep(.actions-warp .actions-add-list.border) { padding-top: 0; background: transparent; border: 0; box-shadow: none; }
.detailed-scene-execution :deep(.actions-warp .actions-add-list__button) { width: 100% !important; height: 36px; font-size: 14px; color: var(--jet-theme-primary, #1677ff); background: var(--ant-color-bg-container, #fff); border-style: dashed; border-color: var(--jet-theme-border, #d9d9d9); }


.detailed-scene-execution :deep(.terms-params-content) { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 6px; }
.detailed-scene-execution :deep(.dropdown-button:is(.column, .termType, .value, .alarm)) { box-sizing: border-box; display: inline-flex; align-items: center; height: 32px; min-height: 32px; color: var(--ant-color-text, #262626); background: var(--ant-color-bg-container, #fff); border: 1px solid #bfc6d0; border-radius: 6px; }
.detailed-scene-execution :deep(.dropdown-button:is(.column, .termType, .value, .alarm):hover) { border-color: var(--ant-color-primary, #1677ff); }
</style>

<style scoped>
.detailed-scene-execution :deep(.actions-add-list__button:not(:disabled):is(:hover, :focus-visible)), .detailed-scene-execution :deep(.detailed-scene-branch-card__add-otherwise:is(:hover, :focus-visible)) { color: var(--jet-theme-primary, #1677ff); border-color: var(--jet-theme-primary, #1677ff); background: var(--ant-color-primary-bg, #e6f4ff); }
</style>
