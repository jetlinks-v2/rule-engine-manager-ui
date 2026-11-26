<template>
  <j-page-container v-bind="$attrs">
    <FullPage :padding="0">
      <section class="rule-list">
        <header class="rule-list__toolbar">
          <ConditionFilter class="rule-list__filter" :fields="filterFields" @change="({ filter }) => refresh(filter)" />
          <span class="rule-list__count">{{ t('RuleInstanceList.loaded', { n: items.length }) }}</span>
          <a-button :title="t('RuleInstanceList.refresh')" :aria-label="t('RuleInstanceList.refresh')" @click="refresh()"><AIcon type="ReloadOutlined" /></a-button>
          <j-permission-button type="primary" :hasPermission="`${permissionKey}:add`" @click="add">
            <template #icon><AIcon type="PlusOutlined" /></template>{{ t('Instance.index.020452-0') }}
          </j-permission-button>
        </header>
        <div ref="viewport" class="rule-list__viewport" tabindex="0" :aria-label="t('EmptyCreate.names.rules')">
          <div v-if="items.length" class="rule-list__space" :style="{ height: `${layout.height}px` }">
            <div class="rule-list__grid" :style="{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, transform: `translateY(${layout.top}px)` }">
              <RuleInstanceCard v-for="rule in visibleItems" :key="rule.id" :rule="rule" :runtime="runtime.get(rule.id)" :preview="previews.get(rule.id)"
                :stale="stale" :failed="observationFailed" :loading="observationPending" :busy="pending === rule.id"
                @open="open(rule)" @toggle="execute(rule, 'toggle')" @delete="execute(rule, 'delete')" />
            </div>
          </div>
          <div v-if="loading && !items.length" class="rule-list__skeleton">
            <div v-for="n in 6" :key="n" class="rule-list__skeleton-card"><a-skeleton active :paragraph="{ rows: 4 }" /></div>
          </div>
          <a-result v-else-if="error && !items.length" status="warning" :title="t('RuleInstanceList.loadFailed')">
            <template #extra><a-button @click="loadMore">{{ t('RuleInstanceList.retry') }}</a-button></template>
          </a-result>
          <CloudEmpty v-else-if="!items.length" :search="[]" :search-name="t('EmptyCreate.names.rules')">
            <j-permission-button type="primary" :hasPermission="`${permissionKey}:add`" @click="add">{{ t('Instance.index.020452-0') }}</j-permission-button>
          </CloudEmpty>
          <div v-if="items.length" class="rule-list__tail">
            <template v-if="error">{{ t('RuleInstanceList.loadFailed') }} <a-button type="link" @click="loadMore">{{ t('RuleInstanceList.retry') }}</a-button></template>
            <template v-else-if="loading"><a-spin size="small" /> {{ t('RuleInstanceList.loadingMore') }}</template>
            <a-button v-else-if="more" type="link" @click="loadMore">{{ t('RuleInstanceList.loadMore') }}</a-button>
            <template v-else>{{ t('RuleInstanceList.end') }}</template>
          </div>
        </div>
      </section>
    </FullPage>
    <Save v-if="visible" :data="current" @success="refresh()" @close-save="visible = false" />
    <RuleEditorDrawer v-if="ruleEditor.visible" :open="ruleEditor.visible" :rule="ruleEditor.current" @updated="updated" @close="closeRuleEditor" />
  </j-page-container>
</template>
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConditionFilter, { type ConditionFilterField } from '@jetlinks-web-core/components/ConditionFilter'
import Save from './Save/index.vue'
import RuleEditorDrawer from './RuleEditor/index.vue'
import RuleInstanceCard from './RuleInstanceCard.vue'
import { useRulePermission } from '../../hook/usePermission'
import { useRuleInstanceList } from './useRuleInstanceList'
import { useRuleInstanceActions } from './useRuleInstanceActions'
import { ruleListMessages } from './listMessages'
const { t } = useI18n({ useScope: 'local', messages: ruleListMessages })
const permissionKey = useRulePermission()
const suspended = ref(false)
const { viewport, items, visibleItems, layout, loading, error, more, runtime, stale, previews, observationFailed, observationPending, refresh, loadMore } = useRuleInstanceList(suspended)
const { visible, current, pending, ruleEditor, closeRuleEditor, add, open, execute, updated } = useRuleInstanceActions(() => refresh())
watch(() => ruleEditor.visible, value => { suspended.value = value })
const filterFields: ConditionFilterField[] = [
  { title: t('Instance.index.020452-3'), dataIndex: 'name', search: { type: 'string' } },
  { title: t('Instance.index.020452-4'), dataIndex: 'state', search: { type: 'select', options: [
    { label: t('Instance.index.020452-1'), value: 'started' }, { label: t('Instance.index.020452-2'), value: 'disable' },
  ] } },
  { title: t('Instance.index.020452-5'), dataIndex: 'description', search: { type: 'string' } },
]
onMounted(() => refresh())
</script>
<style scoped>
.rule-list{height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:var(--panel-background)}
.rule-list__toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:16px;border-bottom:1px solid var(--line)}
.rule-list__filter{width:40rem;max-width:100%;flex:1;min-width:200px}
.rule-list__count{font-size:12px;color:var(--ink-3);white-space:nowrap;margin-inline-start:auto}
.rule-list__viewport{flex:1;min-height:0;min-width:0;overflow:auto;padding:16px;scrollbar-gutter:stable}
.rule-list__space{position:relative}
.rule-list__grid{position:absolute;inset:0 0 auto;display:grid;gap:16px}
.rule-list__skeleton{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(244px,100%),1fr));gap:16px}
.rule-list__skeleton-card{height:224px;padding:16px;border:1px solid var(--line);border-radius:8px}
.rule-list__tail{display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;color:var(--ink-3);font-size:12px}
</style>
